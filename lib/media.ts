/**
 * Converts an mxc:// URI to a direct HTTP download URL.
 * Uses the unauthenticated media endpoint on api.crabba.net.
 *
 * @example getMediaUrl('mxc://crabba.net/abcdef') → 'https://api.crabba.net/_matrix/media/v3/download/crabba.net/abcdef'
 */
const MEDIA_BASE = 'https://api.crabba.net/_matrix/media/v3/download/';

export const getMediaUrl = (mxc: string | undefined | null): string | null => {
    if (!mxc) return null;
    return mxc.replace('mxc://', MEDIA_BASE);
};
