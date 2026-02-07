import { useState } from "react";

export default function App() {
  const [health, setHealth] = useState<string>("(not checked)");

  async function check() {
    const r = await fetch("/health");
    const j = await r.json();
    setHealth(JSON.stringify(j));
  }

  return (
    <div style={{ padding: 16, fontFamily: "Segoe UI, Arial, sans-serif" }}>
      <h2>SQLForgeCS</h2>
      <p>Health: {health}</p>
      <button onClick={check}>Check /health</button>
    </div>
  );
}
