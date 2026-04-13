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
                    # 引用推文内容一并提取
                    quote_el = article.query_selector('[data-testid="quoteTweet"]')
                    if quote_el:
                        qt_el = quote_el.query_selector('[data-testid="tweetText"]')
                        qt_user = quote_el.query_selector('[data-testid="User-Name"]')
                        if qt_el:
                            qt_name = (qt_user.inner_text() or '').split('\n')[0] if qt_user else ''
                            text += f'\n[引用 {qt_name}] ' + (qt_el.inner_text() or '').strip()
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


def scrape_general(url: str) -> dict:
    """用 Fetcher 抓取普通网页"""
    fetcher = Fetcher(auto_match=False)
    page = fetcher.get(url, timeout=30)

    # 提取关键内容
    title = ""
    title_el = page.css_first("title")
    if title_el:
        title = title_el.text()

    # 尝试多种内容选择器
    content = ""
    for selector in ["article", "main", "[role='main']", ".post-content", ".article-content", ".entry-content", "#content"]:
        el = page.css_first(selector)
        if el and el.text().strip():
            content = el.text().strip()
            break

    # 兜底：取 body 文本
    if not content:
        body = page.css_first("body")
        if body:
            content = body.text().strip()

    # 提取 meta 信息
    description = ""
    desc_el = page.css_first('meta[name="description"]') or page.css_first('meta[property="og:description"]')
    if desc_el:
        description = desc_el.attrib.get("content", "")

    # 提取所有链接（用于溯源）
    links = []
    for a in page.css("a[href]")[:50]:
        href = a.attrib.get("href", "")
        text = a.text().strip()
        if href and text and href.startswith("http"):
            links.append({"url": href, "text": text[:100]})

    return {
        "url": url,
        "title": title,
        "description": description,
        "content": content[:15000],
        "links": links,
        "status": "ok"
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
