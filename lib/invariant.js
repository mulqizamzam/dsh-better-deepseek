const PACKAGE_NAME = "dsh-better-deepseek";
const name = "better-deepseek-invariant";
const inject = ["invariants"];
const install = () => {};
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
export { apply, inject, name };
