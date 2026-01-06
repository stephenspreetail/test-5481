from playwright.sync_api import sync_playwright
import os


def test_kova_webapp():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        print("Navigating to http://localhost:5174...")
        page.goto("http://localhost:5174")

        # Wait for the page to load
        print("Waiting for page to load...")
        page.wait_for_load_state("networkidle")

        # Take a screenshot
        screenshot_path = "/tmp/kova_webapp.png"
        page.screenshot(path=screenshot_path, full_page=True)
        print(f"Screenshot saved to {screenshot_path}")

        # Get page title
        title = page.title()
        print(f"Page title: {title}")

        # Get page content for inspection
        content = page.content()
        print(f"Page HTML length: {len(content)} chars")

        # Check for any error messages
        error_elements = page.locator('[class*="error"], [class*="Error"]').all()
        if error_elements:
            print(f"Found {len(error_elements)} error elements")
            for el in error_elements[:3]:
                print(f"  - {el.text_content()[:100]}")

        # Look for key UI elements
        print("\nLooking for UI elements...")

        # Check for login/auth elements (web mode should show these)
        login_buttons = page.locator("text=Login, text=Sign in, text=Log in").all()
        if login_buttons:
            print(f"Found login button(s): {len(login_buttons)}")

        # Check for any buttons
        all_buttons = page.locator("button").all()
        print(f"Found {len(all_buttons)} button(s)")

        # Check for any visible text content
        body_text = page.locator("body").text_content()
        print(f"\nVisible text preview (first 500 chars):")
        print(body_text[:500] if body_text else "No text content")

        # Get console logs
        console_messages = []
        page.on("console", lambda msg: console_messages.append(msg.text))

        # Refresh to capture console logs
        page.reload()
        page.wait_for_load_state("networkidle")

        if console_messages:
            print(f"\nConsole messages ({len(console_messages)}):")
            for msg in console_messages[:10]:
                print(f"  {msg[:200]}")

        browser.close()
        print("\nTest completed!")


if __name__ == "__main__":
    test_kova_webapp()
