import { useState } from "react";

export default function Login() {
  const [email, setEmail] = useState("");

  const handleSend = async (e) => {
    e.preventDefault();
    window.location.replace(
      `${
        import.meta.env.VITE_APP_API_URL
      }/auth/email/authorize?${new URLSearchParams({ email })}`
    );
  };

  return (
    <div className="container">
      <form onSubmit={handleSend}>
        <label>
          Email:
          <input
            type="email"
            name="email"
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <input type="submit" value="Send code" />
      </form>
    </div>
  );
}