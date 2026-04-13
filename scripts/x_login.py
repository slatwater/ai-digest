#!/usr/bin/env python3
"""一次性登录 X/Twitter，保存 session 供 scrape.py 复用"""
import os

SESSION_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'x_session.json')


def main():
    from camoufox.sync_api import Camoufox

    print("正在启动浏览器...")
    print("请在弹出的窗口中登录 X/Twitter")
    print("登录成功后脚本会自动检测并保存 session\n")

    with Camoufox(headless=False) as browser:
        page = browser.new_page()
        page.goto('https://x.com/login', timeout=30000)

        # 自动检测登录完成：等待离开登录页面（最多 120 秒）
        for _ in range(60):
            current = page.url
            if '/login' not in current and '/i/flow' not in current:
                break
            page.wait_for_timeout(2000)
        else:
            print("✗ 超时，未检测到登录完成")
            return

        # 多等几秒确保 cookie 写入完成
        page.wait_for_timeout(3000)

        os.makedirs(os.path.dirname(SESSION_PATH), exist_ok=True)
        page.context.storage_state(path=SESSION_PATH)
        print(f"\n✓ Session 已保存到 {SESSION_PATH}")
        print("后续抓取 X 链接时会自动使用此登录态")


if __name__ == '__main__':
    main()
