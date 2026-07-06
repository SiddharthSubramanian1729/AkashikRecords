import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Read publishable key from .env file manually
const envPath = path.join(process.cwd(), ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
let key = "";
let url = "http://localhost:54321";

envContent.split("\n").forEach(line => {
  if (line.includes("SUPABASE_SERVICE_ROLE_KEY=")) {
    key = line.split("SUPABASE_SERVICE_ROLE_KEY=")[1].replace(/"/g, "").trim();
  }
  if (line.includes("VITE_SUPABASE_URL=")) {
    url = line.split("VITE_SUPABASE_URL=")[1].replace(/"/g, "").trim();
  }
});

const supabase = createClient(url, key);
console.log("Using URL:", url);
console.log("Using Key (Service):", key.substring(0, 10) + "...");

async function test() {
  console.log("Testing chat_messages query...");
  const { data, error } = await supabase
    .from("chat_messages")
    .select("*, profiles(display_name, handle)")
    .limit(1);

  if (error) {
    console.error("Query Error:", error);
  } else {
    console.log("Query Success! Rows:", data);
  }
}

test();
