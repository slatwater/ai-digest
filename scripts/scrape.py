#!/usr/bin/env python3
"""用 Scrapling 抓取网页内容，输出 JSON 格式"""
import sys
import json
from scrapling import Fetcher

def scrape(url: str) -> dict:
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
        "content": content[:15000],  # 限制长度
        "links": links,
        "status": "ok"
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: scrape.py <url>"}))
        sys.exit(1)

    try:
        result = scrape(sys.argv[1])
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e), "status": "error"}))
        sys.exit(1)
