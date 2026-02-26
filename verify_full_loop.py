from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Grant permissions for clipboard if needed, though not used here
        context = browser.new_context()
        page = context.new_page()

        try:
            print("Navigating to Career...")
            page.goto("http://localhost:5173/career")
            time.sleep(2)

            # Setup if needed (if not already set up)
            # Check for "Welcome to the League" or "Coach Career Setup"
            if page.get_by_text("Coach Career Setup").is_visible():
                print("Setting up coach...")
                # page.fill("input[placeholder='Avery Stone']", "Coach Sim")
                # Use generic inputs to be safe
                inputs = page.locator("input")
                if inputs.count() >= 2:
                    inputs.nth(0).fill("Coach Sim")
                    inputs.nth(1).fill("Sim U")

                # Select a team (index 1 is Team, index 0 is Archetype)
                # We need to select a team to enable the button
                selects = page.locator("select")
                if selects.count() >= 2:
                    # Select first available team (index 1 in options usually "Select a team", so index 1 in select_option might be the first team)
                    selects.nth(1).select_option(index=1)

                # Submit
                page.get_by_role("button", name="Start Career").click()
                time.sleep(2)

            # 1. Strategy
            print("Verifying Strategy...")
            # Navigate to strategy tab if available
            strategy_tab = page.get_by_text("Strategy")
            if strategy_tab.is_visible():
                strategy_tab.click()
                time.sleep(1)
                page.screenshot(path="verify_1_strategy.png")
                print("Screenshot 1: Strategy captured.")

            # 2. Sim Season (Iterative)
            print("Navigating to Season Dashboard...")
            page.goto("http://localhost:5173/season")
            time.sleep(2)

            if page.get_by_text("Start New Season").is_visible() or page.get_by_text("Begin Season").is_visible():
                print("Starting New Season...")
                page.get_by_role("button", name="Begin Season").click()
                time.sleep(2)

            # Setup Dialog Handler (accept all confirms)
            page.on("dialog", lambda dialog: dialog.accept())

            # Sim Regular Season
            print("Simulating Regular Season...")
            max_weeks = 15
            weeks_simmed = 0

            while weeks_simmed < max_weeks:
                # Check for "Go to Playoffs"
                if page.get_by_text("Go to Playoffs").is_visible():
                    print("Regular Season Complete. Entering Playoffs.")
                    page.get_by_text("Go to Playoffs").click()
                    time.sleep(2) # Wait for nav
                    break

                # Check for "Sim To End"
                sim_end_btn = page.get_by_role("button", name="Sim To End")
                if sim_end_btn.is_visible():
                    print("Clicking Sim To End...")
                    sim_end_btn.click()
                    # Wait for simulation to finish (could be long)
                    # It shows "Simulating..." while working
                    page.wait_for_timeout(5000)

                    # After sim to end, we should see "Go to Playoffs"
                    if page.get_by_text("Go to Playoffs").is_visible():
                        print("Season Simulated. Going to Playoffs.")
                        page.get_by_text("Go to Playoffs").click()
                        time.sleep(2)
                        break

                # Fallback to Sim Week if Sim To End fails or we want step by step
                sim_week_btn = page.locator("button:has-text('Sim Week')")
                if sim_week_btn.is_visible():
                    # print(f"Simulating Week {weeks_simmed + 1}...")
                    sim_week_btn.click()
                    time.sleep(0.5)
                    weeks_simmed += 1
                else:
                    # Maybe already in playoffs?
                    if page.url.endswith("/playoffs"):
                        break
                    time.sleep(1)

            # Sim Playoffs
            # We are now at /playoffs
            print(f"In Playoffs: {page.url}")
            time.sleep(1)

            # Initialize Bracket
            init_btn = page.get_by_role("button", name="Initialize Bracket")
            if init_btn.is_visible():
                print("Initializing Bracket...")
                init_btn.click()
                time.sleep(1)

            # Simulate Rounds
            rounds = 0
            while rounds < 5:
                # Look for "Simulate [RoundName]"
                sim_round_btn = page.locator("button:has-text('Simulate')")

                if sim_round_btn.is_visible():
                    btn_text = sim_round_btn.inner_text()
                    print(f"Simulating: {btn_text}")
                    sim_round_btn.click()
                    time.sleep(2)
                    rounds += 1
                elif page.get_by_text("National Champion").is_visible() or page.get_by_text("Season Complete").is_visible():
                    print("Playoffs Complete. Champion Declared.")
                    break
                else:
                    print("Waiting for Playoff State update...")
                    time.sleep(1)
                    if rounds > 4: break


            print("Playoffs Complete. Returning to Season Dashboard...")
            page.goto("http://localhost:5173/season")
            time.sleep(2)

            # Check for Season Complete
            if page.get_by_text("Season Complete!").is_visible():
                page.screenshot(path="verify_2_season_end.png")
                print("Screenshot 2: Season End captured.")

                # 3. Advance Season (Roster Progression)
                print("Advancing Season...")
                # Expect "Advance to [Year] Season" or similar
                advance_btn = page.locator("button:has-text('Advance to')")
                if advance_btn.is_visible():
                    # Confirm dialog (already handled by previous listener, but to be safe we can ensure it's handled or assume the first one persists)
                    # page.on("dialog", lambda dialog: dialog.accept()) # REMOVED to avoid double handling
                    advance_btn.click()
                    print("Clicked Advance. Waiting for roster processing...")
                    time.sleep(10) # Long wait for heavy roster processing

                # 4. Check Year 2
                print("Checking New Season...")
                # Should be back at Season Dashboard (or maybe empty if new season started?)
                # If new season started, we should see "Week 1 Matchups" or similar
                if page.get_by_text("Week 1 Matchups").is_visible() or page.get_by_text("Start New Season").is_visible():
                     print("SUCCESS: New Season ready.")
                     page.screenshot(path="verify_3_season_start.png")
                else:
                    print("FAIL: Did not see Week 1 or Start New Season.")
                    page.screenshot(path="verify_fail_year2.png")

                # 5. Check Roster Size logic (optional deep verification)
                # navigate to a team page to see roster size?

            else:
                print("FAIL: Season did not complete. Dashboard state invalid.")
                page.screenshot(path="verify_fail_end.png")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verify_error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
