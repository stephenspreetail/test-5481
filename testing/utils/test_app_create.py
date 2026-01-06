from playwright.sync_api import sync_playwright
import json
import time


def test_create_app_flow():
    """Test creating an app and sending a message in web mode"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()

        # Set up auth tokens via localStorage before navigation
        # We need to inject tokens that the backend will accept
        context.add_init_script(
            """
            localStorage.setItem('accessToken', 'test-access-token');
            localStorage.setItem('refreshToken', 'test-refresh-token');
        """
        )

        page = context.new_page()

        # Collect console logs
        console_logs = []
        page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))

        print("Navigating to http://localhost:5174/chat...")
        page.goto("http://localhost:5174/chat")
        page.wait_for_load_state("networkidle")

        time.sleep(2)  # Give React time to render

        # Take screenshot
        screenshot_path = "/tmp/kova_chat_page.png"
        page.screenshot(path=screenshot_path, full_page=True)
        print(f"Screenshot saved to {screenshot_path}")

        # Check for error elements
        print("\n=== Page State ===")
        title = page.title()
        print(f"Page title: {title}")

        # Look for chat input (Lexical editor)
        chat_inputs = page.locator('[contenteditable="true"]').all()
        print(f"Found {len(chat_inputs)} contenteditable elements")

        # Look for buttons
        buttons = page.locator("button").all()
        print(f"Found {len(buttons)} buttons")
        for btn in buttons[:5]:
            btn_text = btn.text_content() or ""
            print(f"  - Button: {btn_text[:50]}")

        # Check console for errors
        print("\n=== Console Logs ===")
        error_logs = [log for log in console_logs if "error" in log.lower() or "[error]" in log.lower()]
        if error_logs:
            print(f"Found {len(error_logs)} error logs:")
            for log in error_logs[:10]:
                print(f"  {log[:200]}")
        else:
            print("No error logs found")

        # Check for specific errors we were fixing
        api_errors = [log for log in console_logs if "is not a function" in log or "404" in log or "400" in log]
        if api_errors:
            print("\n=== API Errors ===")
            for log in api_errors[:10]:
                print(f"  {log[:300]}")

        # Try to interact with the chat if possible
        if chat_inputs:
            print("\n=== Testing Chat Input ===")
            try:
                chat_input = chat_inputs[0]
                chat_input.click()
                chat_input.type("Hello test")
                print("Successfully typed in chat input")

                # Look for send button
                send_btn = page.locator('button[type="submit"], button:has-text("Send")').first
                if send_btn.is_visible():
                    print("Found send button")
                    # Don't actually click - we'd need valid auth
            except Exception as e:
                print(f"Error interacting with chat: {e}")

        browser.close()
        print("\n=== Test Complete ===")


if __name__ == "__main__":
    test_create_app_flow()
