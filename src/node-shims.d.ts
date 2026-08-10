declare module "node:http" { const value: any; export default value; }
declare module "node:https" { const value: any; export default value; }
declare module "node:fs" { const value: any; export default value; }
declare module "node:path" { const value: any; export default value; }
declare module "node:crypto" { const value: any; export default value; }
declare module "node:url" { export const fileURLToPath: (url: string | URL) => string; }
declare const process: any;
declare const Buffer: any;
