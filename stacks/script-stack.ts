import { use, StackContext, Api, Script } from "sst/constructs";
import ApiStack from "./api-stack";

export default function ScriptStack({ app, stack }: StackContext) {
  //const { api } = use(ApiStack);

  const script = new Script(stack, "MyScript", {
    onCreate: "src/script/handler.main",
    onUpdate: "src/script/handler.main",
    params: {
      hello: "World",
      integer: 128,
      //api: api.url,
    },
  });

  //const script2 = new Script(stack, "MyScript2", {
  //  onCreate: "src/script/handler.main",
  //  onUpdate: "src/script/handler.main",
  //  onDelete: "src/script/handler.main",
  //  params: {
  //    hello: "World2",
  //  },
  //});
  //
  //script.node.addDependency(script2);

  stack.addOutputs({
    onCreate: script.createFunction?.functionName || "",
    //onCreate2: script2.createFunction?.functionName || "",
    //onUpdate2: script2.updateFunction?.functionName || "",
    //onDelete2: script2.deleteFunction?.functionName || "",
  });
}
