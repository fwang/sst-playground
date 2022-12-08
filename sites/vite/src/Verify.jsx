import { useState } from "react";

export default function Verify() {
  const [code, setCode] = useState("");

  const handleSend = async (e) => {
    e.preventDefault();
    window.location.replace(
      `${
        import.meta.env.VITE_APP_API_URL
      }/auth/email/callback?${new URLSearchParams({ code })}`
    );
  };

  return (
    <div className="container">
      <form onSubmit={handleSend}>
        <label>
          Code:
          <input
            type="code"
            name="code"
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        <input type="submit" value="Verify" />
      </form>
    </div>
  );
}