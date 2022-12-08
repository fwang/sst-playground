import { useEffect, useState } from "react";

export default function Home() {
  const [user, setUser] = useState(null);

  const loadSessionUser = () => {
    fetch(`${import.meta.env.VITE_APP_API_URL}/session`, {
      //method: "GET",
      credentials: "include",
    })
      .then(response => {
        if (response.ok) {
          return response.json();
        }
        //window.location.replace("/login");
      })
      .then(json =>setUser(json));
  };

  useEffect(() => {
    loadSessionUser();
  }, []);

  return (
    <div className="container">
      { !user && <p>Loading...</p> }
      { user && <p>You are logged in as {user.email}.</p> }
    </div>
  );
}