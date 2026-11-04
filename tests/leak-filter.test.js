// R-0247 leak-filter tests. Runs offline against the leak-filter section of a relay file (default: the live server.js, then
// the proposed copy), so both versions are judged by the same cases. All values are made up here; none is a real secret.
// Usage: node leak-filter.test.js [file ...]
"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto");

function load(file) {
  const src = fs.readFileSync(file, "utf8");
  const a = src.indexOf("// ---------- leak filter ----------"), b = src.indexOf("// ---------- Zoho ----------");
  const env = (k, d) => (process.env[k] === undefined || process.env[k] === "" ? d : process.env[k]);
  return new Function("env", src.slice(a, b) + "\nreturn leakReason;")(env);
}
const hex = (n) => crypto.randomBytes(n).toString("hex").slice(0, n);
function withCheckDigit(body) { // append the digit that makes body Luhn-valid
  for (let c = 0; c <= 9; c++) { const d = body + c; let s = 0, alt = false;
    for (let i = d.length - 1; i >= 0; i--) { let n = +d[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } s += n; alt = !alt; }
    if (s % 10 === 0) return d; }
}
const zohoLuhn = withCheckDigit("115686000000969305"); // a Luhn-valid Projects-shaped id, like FI2-T67's
const visa19 = withCheckDigit("491611900012345678");   // a 19-digit Luhn-valid number with a Zoho prefix

// [name, text, towardExternal, expected: null = delivered, string = withheld reason]
const CASES = [
  // ---- must now be delivered (the three withheld replies, and Zoho ids toward GPT)
  ["P1 sha256 checksum after its label (finance FI2-T69)", "- **Checksum:** sha256 `" + hex(64) + "`", false, null],
  ["P2 SHA-256 after a resource id (bizops BO2-T82)", "Resource ID: `isck39785c340b7154d859c632b7ae65d4e7a`. SHA-256: `" + hex(64) + "`. The read-back matched.", false, null],
  ["P3 git commit after its label (salesmkt A6Y2-T86)", "- **Commit:** `" + hex(40) + "`, which the live page reports", false, null],
  ["P4 commit, plain form", "deployed commit " + hex(40), false, null],
  ["P5 Luhn-valid Zoho Projects id toward GPT", "Task " + zohoLuhn + " is FI2-T67.", true, null],
  ["P6 several Zoho ids toward GPT", "Tasks 1156860000009611011, " + zohoLuhn + " and 1156860000009694041 are done.", true, null],
  ["P7 Books id toward GPT (different org prefix)", "chart of accounts 89 accounts, first " + withCheckDigit("220018000000123456"), true, null],
  ["P8 Zoho id internally (was already allowed)", "Task " + zohoLuhn, false, null],
  // ---- must still be withheld
  ["N1 unlabelled 64-hex", "here it is: " + hex(64), false, "a long key or token"],
  ["N2 unlabelled 40-hex", "value " + hex(40), false, "a long key or token"],
  ["N3 hash label but a secret word in front", "api key sha256: " + hex(64), false, "a long key or token"],
  ["N4 token labelled as commit", "token commit " + hex(40), false, "a long key or token"],
  ["N5 labelled but wrong length (48)", "sha256 " + hex(48), false, "a long key or token"],
  ["N6 labelled but upper case", "sha256 " + hex(64).toUpperCase(), false, "a long key or token"],
  ["N7 one labelled hash plus one unlabelled", "commit " + hex(40) + " and secret " + hex(64), false, "a long key or token"],
  ["N8 Zoho OAuth token", "1000." + hex(32) + "." + hex(32), false, "a Zoho token or grant code"],
  ["N9 sk- API key", "sk-" + hex(32), false, "an API key"],
  ["N10 GitHub token", "ghp_" + hex(36), false, "an API key"],
  ["N11 Slack token", "xoxb-" + hex(24), false, "a Slack token"],
  ["N12 cloud access key", "AKIA" + "ABCDEFGHIJKLMNOP", false, "a cloud access key"],
  ["N13 private key", "-----BEGIN RSA PRIVATE KEY-----", false, "a private key"],
  ["N14 bearer token", "Bearer " + hex(40) + "xyz", false, "a bearer token"],
  ["N15 credential assignment", "client_secret=abc123def456ghi", false, "a credential"],
  ["N16 test card to GPT", "card 4111111111111111", true, "a payment card number"],
  ["N17 spaced card to GPT", "4111 1111 1111 1111", true, "a payment card number"],
  ["N18 Amex to GPT", "378282246310005", true, "a payment card number"],
  ["N19 Zoho-prefixed 19 digits next to a card word", "Visa card " + visa19, true, "a payment card number"],
  ["N20 Zoho-prefixed digits written with dashes", zohoLuhn.replace(/(\d{4})(?=\d)/g, "$1-"), true, "a payment card number"],
  ["N21 Luhn-valid 19 digits, unknown prefix, near a card word", "card " + withCheckDigit("601100000000000000"), true, "a payment card number"],
  ["Y-LENGTH unbroken Luhn-valid 19 digits, unknown prefix (#247)", "record " + withCheckDigit("601100000000000000"), true, null],
  ["N-LENGTH 19 digits with dashes stay a card", withCheckDigit("601100000000000000").replace(/(\d{4})(?=\d)/g, "$1-"), true, "a payment card number"],
  ["N22 SSN to GPT", "SSN 123-45-6789", true, "a Social Security number"],
  ["N23 EIN to GPT", "EIN 12-3456789", true, "an employer identification number"],
];

const files = process.argv.slice(2).length ? process.argv.slice(2) : [path.join(__dirname, "../server.js")];
let exit = 0;
for (const f of files) {
  const leakReason = load(f);
  let pass = 0;
  console.log("\n== " + path.relative(path.join(__dirname, ".."), f));
  for (const [name, text, ext, want] of CASES) {
    const got = leakReason(text, ext);
    const ok = got === want;
    pass += ok;
    console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "   (expected " + (want || "delivered") + ", got " + (got || "delivered") + ")"));
  }
  console.log(pass + "/" + CASES.length + " as required");
  if (pass !== CASES.length) exit = 1;
}
process.exit(exit);
