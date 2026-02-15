declare module 'adm-zip' {
  class AdmZip {
    constructor(path?: string | Buffer);
    extractAllTo(targetPath: string, overwrite?: boolean): void;
  }
  export = AdmZip;
}
