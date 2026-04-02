#!/usr/bin/env python3
"""用 Scrapling 抓取网页内容，输出 JSON 格式"""
import sys
import json
from urllib.parse import urlparse
from scrapling import Fetcher


# X/Twitter 域名
TWITTER_DOMAINS = {'x.com', 'twitter.com', 'mobile.twitter.com'}


def is_twitter(url: str) -> bool:
    try:
        host = urlparse(url).hostname or ''
        return any(host == d or host.endswith('.' + d) for d in TWITTER_DOMAINS)
    except Exception:
        return False


def scrape_twitter(url: str) -> dict:
    """用 StealthyFetcher 抓取 X/Twitter（需要 JS 渲染）"""
    from scrapling.fetchers import StealthyFetcher
    page = StealthyFetcher.fetch(
        url,
        headless=True,
        network_idle=True,
        wait=3000,
        timeout=45000,
    )

    # 提取推文内容
    articles = page.css('article')
    if not articles:
        return {"url": url, "error": "未找到推文内容", "status": "error"}

    # 第一个 article 是主推文
    main_tweet = articles[0].get_all_text()

    # 引用推文和回复（如有）
    replies = []
    for article in articles[1:6]:  # 最多取 5 条回复
        replies.append(article.get_all_text())

    content = main_tweet
    if replies:
        content += "\n\n--- 回复 ---\n" + "\n---\n".join(replies)

    # 提取作者信息
    author = ""
    author_el = page.css_first('article a[role="link"][href*="/"]')
    if author_el:
        author = author_el.get_all_text()

    return {
        "url": url,
        "title": f"{author} 的推文" if author else "X/Twitter 推文",
        "content": content[:15000],
        "author": author,
        "status": "ok"
    }


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
