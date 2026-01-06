from playwright.sync_api import sync_playwright


def test_kova_webapp():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Capture all console messages including errors
        console_messages = []
        page.on("console", lambda msg: console_messages.append(f"[{msg.type}] {msg.text}"))

        # Capture page errors
        page_errors = []
        page.on("pageerror", lambda err: page_errors.append(str(err)))

        print("Navigating to http://localhost:5174...")
        try:
            page.goto("http://localhost:5174", timeout=30000)
            page.wait_for_load_state("networkidle", timeout=30000)
        except Exception as e:
            print(f"Navigation error: {e}")

        print(f"\n=== Console Messages ({len(console_messages)}) ===")
        for msg in console_messages:
            print(msg[:500])

        print(f"\n=== Page Errors ({len(page_errors)}) ===")
        for err in page_errors:
            print(err[:1000])

        # Check the actual DOM content
        print("\n=== DOM Inspection ===")
        root = page.locator("#root")
        root_html = root.inner_html()
        print(f"#root innerHTML length: {len(root_html)}")
        print(f"#root innerHTML preview: {root_html[:500]}")

        # Take screenshot
        page.screenshot(path="/tmp/kova_webapp_debug.png", full_page=True)
        print("\nScreenshot saved to /tmp/kova_webapp_debug.png")

        browser.close()


if __name__ == "__main__":
    test_kova_webapp()
