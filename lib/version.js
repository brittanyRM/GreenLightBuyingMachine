// Build stamp.
//
// Two rounds were spent on a bug that was already fixed in the source
// but not in the deployment. The setup check shows this string, so
// "is the fix live?" is answered by reading it rather than inferring
// it from an error message.
export const APP_VERSION = "113";
export const APP_BUILT = "2026-08-29";
