import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface ProfileData {
    id: string;
    matrix_user_id: string;
    username: string;
    avatar_url: string;
    banner_url: string;
    bio: string;
}

// Global cache to prevent redundant Supabase queries for the same matrix_user_id
const profileCache: Record<string, Promise<ProfileData | null>> = {};

export function useMatrixProfile(matrixUserId: string) {
    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!matrixUserId) {
            setLoading(false);
            return;
        }

        let isMounted = true;

        const fetchProfile = async () => {
            const supabase = createClient();

            if (!profileCache[matrixUserId]) {
                profileCache[matrixUserId] = Promise.resolve(
                    supabase
                        .from('profiles')
                        .select('*')
                        .eq('matrix_user_id', matrixUserId)
                        .single()
                        .then(({ data, error }) => {
                            if (error || !data) return null;
                            return data as ProfileData;
                        })
                );
            }

            try {
                const data = await profileCache[matrixUserId];
                if (isMounted) {
                    setProfile(data);
                    setLoading(false);
                }
            } catch (error) {
                console.error('Failed to fetch profile', error);
                if (isMounted) setLoading(false);
            }
        };

        fetchProfile();

        return () => {
            isMounted = false;
        };
    }, [matrixUserId]);

    return { profile, loading };
}
