const { chromium } = require("playwright");
const fs = require("fs");
const { parse } = require("csv-parse/sync");
const { stringify } = require("csv-stringify/sync");

const INPUT_CSV = "./juicebox_100_match.csv";
const OUTPUT_CSV = "./juicebox_resolved.csv";

// Delay between requests to avoid rate limiting
const DELAY_MS = 3000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const csvContent = fs.readFileSync(INPUT_CSV, "utf-8");
  const records = parse(csvContent, { columns: true, skip_empty_lines: true });

  console.log(`📄 Loaded ${records.length} candidates from CSV`);
  console.log("🌐 Opening browser — please log in to LinkedIn if needed...\n");

  // Launch browser with persistent context so login session is saved
  const userDataDir = "./linkedin-session";
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 900 },
  });

  const page = await context.newPage();

  // Navigate to LinkedIn to allow login
  await page.goto("https://www.linkedin.com/feed/", {
    waitUntil: "domcontentloaded",
  });

  // Check if user needs to log in
  const currentUrl = page.url();
  if (
    currentUrl.includes("/login") ||
    currentUrl.includes("/checkpoint") ||
    currentUrl.includes("authwall")
  ) {
    console.log("⏳ Waiting for you to log in to LinkedIn...");
    console.log("   (the script will continue automatically after login)\n");
    await page.waitForURL("**/feed/**", { timeout: 120000 });
  }

  console.log("✅ Logged in! Starting to resolve search URLs...\n");

  const results = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const searchUrl = record["LinkedIn"];
    const name = record["Name"];

    console.log(
      `[${i + 1}/${records.length}] Resolving: ${name} (${record["Company"]})`
    );

    let profileUrl = "";

    try {
      await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
      await sleep(2000);

      // Wait for search results to load
      // LinkedIn search results have profile links in various selectors
      const profileLink = await page.evaluate(() => {
        // Try multiple selectors for the first search result profile link
        const selectors = [
          // Main result link with /in/ path
          'a[href*="/in/"]',
          // Entity result link
          '.entity-result__title-text a[href*="/in/"]',
          // Reusable search result
          '.reusable-search__result-container a[href*="/in/"]',
          // Alternative selector
          'span.entity-result__title-text a',
        ];

        for (const selector of selectors) {
          const links = document.querySelectorAll(selector);
          for (const link of links) {
            const href = link.getAttribute("href");
            if (href && href.includes("/in/") && !href.includes("/search/")) {
              // Clean the URL - remove query params
              const url = new URL(href, window.location.origin);
              return `https://www.linkedin.com${url.pathname}`;
            }
          }
        }
        return "";
      });

      if (profileLink) {
        profileUrl = profileLink;
        console.log(`   ✅ → ${profileUrl}`);
      } else {
        console.log(`   ⚠️  No profile found in search results`);
        profileUrl = searchUrl; // Keep original if not found
      }
    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`);
      profileUrl = searchUrl;
    }

    results.push({
      Name: record["Name"],
      LinkedIn: profileUrl,
      Title: record["Title"],
      Company: record["Company"],
      "Match %": record["Match %"],
    });

    // Delay to avoid rate limiting
    if (i < records.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  // Write output CSV
  const output = stringify(results, { header: true });
  fs.writeFileSync(OUTPUT_CSV, output);
  console.log(`\n🎉 Done! Resolved URLs saved to: ${OUTPUT_CSV}`);

  await context.close();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
