import Layout from "../components/layout";
import utilStyles from "../styles/utils.module.css";

export async function getServerSideProps() {
  console.log("== ssr log ==");
  console.log(process.env);
  return {
    props: {
      time: Date.now(),
      envUrlPublic: process.env.NEXT_PUBLIC_API_URL,
      envUrlPrivate: process.env.API_URL,
      envFName: process.env.NEXT_PUBLIC_FNAME,
    },
  };
}

export default function Page({ time, envFName, envUrlPublic, envUrlPrivate }) {
  return (
    <Layout>
      <article>
        <h1 className={utilStyles.headingXl}>SSR - Server Side Rendering</h1>
        <h1 className={utilStyles.headingXl}>Current time: {time}</h1>

        <h1 className={utilStyles.headingXl}>SSR</h1>
        <p>NEXT_PUBLIC_API_URL: {envUrlPublic}</p>
        <p>API_URL: {envUrlPrivate}</p>
        <p>NEXT_PUBLIC_FNAME: {envFName}</p>

        <h1 className={utilStyles.headingXl}>Browser</h1>
        <p>NEXT_PUBLIC_API_URL: {process.env.NEXT_PUBLIC_API_URL}</p>
        <p>API_URL: {process.env.API_URL}</p>
        <p>NEXT_PUBLIC_FNAME: {process.env.NEXT_PUBLIC_FNAME}</p>
      </article>
    </Layout>
  );
}
