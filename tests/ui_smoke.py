"""Offline browser checks. Run with tests/ui-server.mjs and with_server.py."""
from playwright.sync_api import sync_playwright, expect

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=1)
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto("http://127.0.0.1:43337")
    # SSE intentionally stays open, so readiness is the live connection indicator.
    expect(page.locator('#connection[data-state="online"]')).to_be_visible()
    expect(page.get_by_role("heading", name="みんなのルーム")).to_be_visible()
    page.get_by_role("button", name="🛡️ strict-reviewer").click()
    message = page.get_by_role("textbox", name="メッセージ", exact=True)
    message.fill("並列タスクの依存関係を、安全に扱うためのレビュー観点を整理したいです。 [delay]")
    page.get_by_role("button", name="送信", exact=True).click()
    page.get_by_role("button", name="🎨 frontend-dev").click()
    expect(page.locator(".message")).to_have_count(0)
    page.get_by_role("button", name="🛡️ strict-reviewer").click()
    expect(page.locator("#messages .message")).to_have_count(2, timeout=15000)
    expect(page.locator("#messages img")).to_have_count(0)
    expect(page.locator("#messages pre code")).to_contain_text('const team = "squad";')
    page.reload()
    expect(page.locator('#connection[data-state="online"]')).to_be_visible()
    expect(page.locator("#messages .message")).to_have_count(2, timeout=10000)
    # Browser network failure: no external call, retry uses the same request ID.
    page.route("**/api/chat", lambda route: route.abort())
    message.fill("この会話は再送できる？")
    page.get_by_role("button", name="送信", exact=True).click()
    expect(page.get_by_role("button", name="再送", exact=True)).to_be_visible()
    page.unroute("**/api/chat")
    page.get_by_role("button", name="再送", exact=True).click()
    expect(page.locator("#messages .message")).to_have_count(4, timeout=15000)
    # IME Enter does not submit; Shift+Enter retains a line break.
    message.fill("日本語変換")
    message.dispatch_event("keydown", {"key": "Enter", "isComposing": True})
    expect(message).to_have_value("日本語変換")
    message.fill("")
    page.get_by_role("textbox", name="今回のゴール").fill("APIのテストを追加して、使い方のドキュメントも更新する")
    page.get_by_role("button", name="計画をつくる", exact=True).click()
    expect(page.get_by_role("button", name="この計画で実行")).to_be_visible(timeout=15000)
    page.locator(".plan-task summary").first.click()
    page.get_by_role("textbox", name="タイトル 1", exact=True).fill("APIの振る舞いをテストする")
    page.get_by_role("button", name="この計画で実行").click()
    expect(page.get_by_role("button", name="レポートを開く")).to_be_visible(timeout=20000)
    page.get_by_role("button", name="レポートを開く").click()
    expect(page.locator("#artifactContent")).to_contain_text("Devin Squad Run")
    page.get_by_role("button", name="成果物を閉じる").click()
    page.screenshot(path="/tmp/devin-squad-desktop.png", full_page=True)
    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(200)
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    page.get_by_role("button", name="会話一覧を開く").click()
    page.get_by_role("button", name="🌐 みんなのルーム").click()
    expect(page.get_by_role("heading", name="みんなのルーム")).to_be_visible()
    message.fill("次に取り組むタスクを一緒に整理して")
    page.get_by_role("button", name="送信", exact=True).click()
    expect(page.locator("#messages .message")).to_have_count(2, timeout=15000)
    page.screenshot(path="/tmp/devin-squad-mobile.png", full_page=True)
    # Check open and close controls after a responsive resize.
    page.get_by_role("button", name="実行パネル", exact=True).click()
    if not page.get_by_role("heading", name="作業をチームに任せる").is_visible():
        page.get_by_role("button", name="実行パネル", exact=True).click()
    expect(page.get_by_role("heading", name="作業をチームに任せる")).to_be_visible()
    page.get_by_role("button", name="実行パネルを閉じる").click()
    # A failing task and its skipped dependency remain visible after reload.
    failed = page.request.post("http://127.0.0.1:43337/api/run", data={"tasks": [
        {"id": "failure", "title": "失敗の確認", "prompt": "[fail]"},
        {"id": "dependent", "title": "依存タスク", "prompt": "no changes", "dependsOn": ["failure"]}
    ]}).json()
    page.evaluate("id => localStorage.setItem('squad-run', JSON.stringify(id))", failed["runId"])
    page.reload()
    page.get_by_role("button", name="実行パネル", exact=True).click()
    expect(page.locator("#tasks")).to_contain_text("exit code 7", timeout=15000)
    expect(page.locator("#tasks")).to_contain_text("スキップ")
    assert not errors, errors
    browser.close()
    print("Browser checks passed; screenshots saved in /tmp/devin-squad-{desktop,mobile}.png")
