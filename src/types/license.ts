/** 「开源许可证」页使用的第三方包声明信息。 */
export interface LicenseInfo {
  ecosystem: "npm" | "Rust";
  name: string;
  version: string;
  license: string;
  homepage: string;
  /** 包附带的许可与声明文件全文;没有文件时为空字符串。 */
  licenseText: string;
}
