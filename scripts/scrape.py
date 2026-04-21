#!/usr/bin/env python3
"""用 Scrapling 抓取网页内容，输出 JSON 格式"""
import os
import sys
import json
from urllib.parse import urlparse
from scrapling import Fetcher


# X/Twitter 域名
TWITTER_DOMAINS = {'x.com', 'twitter.com', 'mobile.twitter.com'}

# 登录态 session 路径
SESSION_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'x_session.json')


def load_x_cookies():
    """加载已保存的 X 登录 cookie，补全 Playwright 所需字段"""
    if not os.path.exists(SESSION_PATH):
        return None
    try:
        with open(SESSION_PATH) as f:
            state = json.load(f)
        cookies = state.get('cookies', [])
        for c in cookies:
            if 'sameSite' not in c:
                c['sameSite'] = 'None' if c.get('secure') else 'Lax'
        return cookies
    except Exception:
        return None


def is_twitter(url: str) -> bool:
    try:
        host = urlparse(url).hostname or ''
        return any(host == d or host.endswith('.' + d) for d in TWITTER_DOMAINS)
    except Exception:
        return False


def scrape_twitter(url: str) -> dict:
    """StealthyFetcher 反检测 + cookie 登录态 + 滚动加载完整 thread"""
    from scrapling.fetchers import StealthyFetcher

    cookies = load_x_cookies()
    result_data = {'collected': [], 'author': ''}

    def thread_action(page):
        """page_action 回调：注入 cookie → home 初始化 session → 导航推文 → 滚动收集"""
        if cookies:
            page.context.add_cookies(cookies)
            # 先访问首页让 X 的 JS 初始化登录态（直接跳推文会 "Something went wrong"）
            page.goto('https://x.com/home', wait_until='domcontentloaded', timeout=20000)
            page.wait_for_timeout(3000)

        # 导航到目标推文
        page.goto(url, wait_until='domcontentloaded', timeout=30000)
        try:
            page.wait_for_selector('article', timeout=10000)
        except Exception:
            return page
        page.wait_for_timeout(2000)

        # 逐步滚动，边滚边收集（应对虚拟滚动 DOM 回收）
        seen_keys = set()
        for scroll_round in range(20):
            if len(result_data['collected']) >= 50:
                break
            articles = page.query_selector_all('article')
            new_found = False
            for article in articles:
                if len(result_data['collected']) >= 50:
                    break
                try:
                    # 精确提取推文正文，排除点赞/转发/时间等噪音
                    tweet_el = article.query_selector('[data-testid="tweetText"]')
                    text = (tweet_el.inner_text() or '').strip() if tweet_el else ''
                    # 引用推文：X 已弃用 [data-testid="quoteTweet"]，现用 div[role="link"][tabindex="0"]
                    # 作者 handle 从 [data-testid^="UserAvatar-Container-XXX"] 解析，第一个是主作者，其余为引用作者
                    quote_link = article.query_selector('div[role="link"][tabindex="0"]')
                    if quote_link:
                        qt_text = (quote_link.inner_text() or '').strip()
                        if qt_text and len(qt_text) > 20:
                            qt_handle = ''
                            try:
                                avatars = article.query_selector_all('[data-testid^="UserAvatar-Container-"]')
                                for av in avatars[1:]:  # 跳过主作者
                                    tid = av.get_attribute('data-testid') or ''
                                    qt_handle = tid.replace('UserAvatar-Container-', '')
                                    if qt_handle:
                                        break
                            except Exception:
                                pass
                            prefix = f'[引用 @{qt_handle}]' if qt_handle else '[引用]'
                            text += f'\n{prefix} {qt_text}'
                except Exception:
                    continue
                if not text or len(text) < 10:
                    continue
                key = text[:150]
                if key in seen_keys:
                    continue
                seen_keys.add(key)
                new_found = True

                author_href = ''
                try:
                    links = article.query_selector_all('a[role="link"]')
                    for link in links:
                        href = link.get_attribute('href') or ''
                        if href.startswith('/') and href.count('/') == 1:
                            author_href = href.lower()
                            break
                except Exception:
                    pass
                result_data['collected'].append((author_href, text))

            if not new_found and scroll_round > 0:
                break
            page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
            page.wait_for_timeout(2000)

        try:
            user_name_el = page.query_selector('article [data-testid="User-Name"]')
            if user_name_el:
                result_data['author'] = (user_name_el.inner_text() or '').split('\n')[0]
        except Exception:
            pass
        return page

    try:
        StealthyFetcher.fetch(
            'https://x.com',
            headless=True,
            network_idle=True,
            wait=1000,
            timeout=45000,
            page_action=thread_action,
        )
    except Exception as e:
        if not result_data['collected']:
            return {"url": url, "error": str(e), "status": "error"}

    collected = result_data['collected']
    if not collected:
        hint = "未找到推文内容"
        if not cookies:
            hint += "（未检测到登录态，运行 python3 scripts/x_login.py 登录后重试）"
        return {"url": url, "error": hint, "status": "error"}

    # 按作者分组：主推文作者 → thread，其他 → 回复
    main_author = collected[0][0]
    thread_parts = []
    replies = []
    for i, (href, text) in enumerate(collected):
        if i == 0 or (main_author and href == main_author):
            thread_parts.append(text)
        else:
            replies.append(text)

    content = "\n\n".join(thread_parts)
    if replies[:5]:
        content += "\n\n--- 回复 ---\n" + "\n---\n".join(replies[:5])

    # 标题区分单推/thread
    author = result_data['author']
    if len(thread_parts) > 1:
        title = f"{author} 的 thread（{len(thread_parts)} 条）" if author else f"X/Twitter Thread（{len(thread_parts)} 条）"
    else:
        title = f"{author} 的推文" if author else "X/Twitter 推文"

    result = {
        "url": url,
        "title": title,
        "content": content[:15000],
        "author": author,
        "threadSize": len(thread_parts),
        "status": "ok"
    }

    # 只拿到 1 条但有 thread 指示器 → 标记截断
    if len(thread_parts) == 1:
        import re
        if re.search(r'Read \d+ repl|Show this thread|:\s*\n\s*\d+:\d+', content):
            result["truncated"] = True
            result["hint"] = "这是一个 thread，滚动后仍只抓到第一条。请用 WebFetch 获取完整内容。"

    return result


def scrape_general_stealth(url: str) -> dict:
    """反爬 fallback：用 StealthyFetcher（Camoufox）抓普通网页，用浏览器 JS 取正文"""
    from scrapling.fetchers import StealthyFetcher
    box = {"title": "", "content": "", "description": "", "links": []}

    def action(page):
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(1500)
        try:
            box["title"] = page.title() or ""
        except Exception:
            pass
        # 主内容选择器优先级
        content = ""
        for sel in ["article", "main", "[role='main']", ".post-content", ".article-content", ".entry-content", "#content"]:
            try:
                el = page.query_selector(sel)
                if el:
                    t = (el.inner_text() or "").strip()
                    if t:
                        content = t
                        break
            except Exception:
                continue
        if not content:
            try:
                body = page.query_selector("body")
                if body:
                    content = (body.inner_text() or "").strip()
            except Exception:
                pass
        box["content"] = content[:15000]
        # meta
        try:
            desc_el = page.query_selector('meta[name="description"]') or page.query_selector('meta[property="og:description"]')
            if desc_el:
                box["description"] = desc_el.get_attribute("content") or ""
        except Exception:
            pass
        # 链接
        try:
            links = []
            for a in (page.query_selector_all('a[href]') or [])[:50]:
                href = a.get_attribute('href') or ''
                text = (a.inner_text() or '').strip()
                if href.startswith('http') and text:
                    links.append({"url": href, "text": text[:100]})
            box["links"] = links
        except Exception:
            pass
        return page

    try:
        StealthyFetcher.fetch(url, headless=True, network_idle=True, wait=1000, timeout=45000, page_action=action)
    except Exception as e:
        return {"url": url, "error": f"stealth 抓取异常: {e}", "status": "error"}
    if not box["content"] or len(box["content"]) < 100:
        return {"url": url, "error": "stealth 抓取后内容仍为空（可能被反爬拦住或页面渲染依赖交互）", "status": "error"}
    # 可读性检测：WebGL / Canvas / 加密内容会让 innerText 变二进制乱码
    # 统计"正常字符"占比：ASCII 可打印 + 中日韩 + 中英标点；过低 → 判定为不可读
    def _looks_readable(s: str) -> bool:
        if not s:
            return False
        good = 0
        for c in s:
            cp = ord(c)
            if c.isspace() or (0x20 <= cp <= 0x7e) or (0x4e00 <= cp <= 0x9fff) or (0x3000 <= cp <= 0x303f) or (0xff00 <= cp <= 0xffef) or (0x3040 <= cp <= 0x30ff) or (0xac00 <= cp <= 0xd7af):
                good += 1
        return good / len(s) > 0.85
    if not _looks_readable(box["content"]):
        return {
            "url": url,
            "error": "抓取内容不可读（可能是 Canvas/WebGL 页、加密脚本或动态 SPA；建议人工确认后手动追问）",
            "status": "error",
        }
    return {
        "url": url,
        "title": box["title"],
        "description": box["description"],
        "content": box["content"],
        "links": box["links"],
        "status": "ok",
        "fetcher": "stealth",
    }


def scrape_general(url: str) -> dict:
    """用 Fetcher 抓取普通网页；403/401/429/内容过短时自动 fallback 到 StealthyFetcher"""
    fetcher = Fetcher(auto_match=False)
    try:
        page = fetcher.get(url, timeout=30)
    except Exception as e:
        # Fetcher 直接崩溃，直接走 stealth
        stealth = scrape_general_stealth(url)
        if stealth.get("status") == "ok":
            return stealth
        return {"url": url, "error": f"Fetcher 异常: {e}；{stealth.get('error', '')}", "status": "error"}

    http_status = getattr(page, "status", None)

    # Scrapling >=0.2: .text 只返回直接文本节点，get_all_text() 递归获取子元素文本
    title = ""
    title_el = page.css_first("title")
    if title_el:
        title = str(title_el.text) if str(title_el.text) != 'None' else str(title_el.get_all_text())

    # 尝试多种内容选择器
    content = ""
    for selector in ["article", "main", "[role='main']", ".post-content", ".article-content", ".entry-content", "#content"]:
        el = page.css_first(selector)
        if el:
            t = str(el.get_all_text()).strip()
            if t:
                content = t
                break

    if not content:
        body = page.css_first("body")
        if body:
            content = str(body.get_all_text()).strip()

    # fallback 触发条件：反爬状态码 或 内容过短（< 200 字，可能是 Cloudflare 挑战页）
    need_stealth = (http_status in (401, 403, 429, 451)) or (len(content) < 200)
    if need_stealth:
        stealth = scrape_general_stealth(url)
        if stealth.get("status") == "ok":
            return stealth
        # stealth 也失败，返回详细错误（带 HTTP 状态码）
        return {
            "url": url,
            "error": f"HTTP {http_status or '?'} + stealth fallback 失败: {stealth.get('error', '未知')}",
            "status": "error",
            "httpStatus": http_status,
        }

    # meta
    description = ""
    desc_el = page.css_first('meta[name="description"]') or page.css_first('meta[property="og:description"]')
    if desc_el:
        description = desc_el.attrib.get("content", "")

    links = []
    for a in page.css("a[href]")[:50]:
        href = a.attrib.get("href", "")
        text = str(a.get_all_text()).strip()
        if href and text and href.startswith("http"):
            links.append({"url": href, "text": text[:100]})

    return {
        "url": url,
        "title": title,
        "description": description,
        "content": content[:15000],
        "links": links,
        "status": "ok",
        "httpStatus": http_status,
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: scrape.py <url>"}))
        sys.exit(1)

    url = sys.argv[1]
    try:
        if is_twitter(url):
            result = scrape_twitter(url)
        else:
            result = scrape_general(url)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e), "status": "error"}))
        sys.exit(1)
