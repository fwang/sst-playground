import type { AstroAdapter, AstroIntegration } from "astro"

const NAME = "lambda-adapter"

function getAdapter(): AstroAdapter {
  return {
    name: NAME,
    serverEntrypoint: `./${NAME}/server-edge`,
    exports: ["handler"],
  }
}

export default function createIntegration(): AstroIntegration {
  return {
    name: NAME,
    hooks: {
      "astro:config:done": ({ setAdapter }) => {
        setAdapter(getAdapter())
      },
    },
  }
}
