'use client';
import { ProfileDialogProps } from "./ProfileDialog";

import dynamic from 'next/dynamic';

// Define the inner component dynamically *inside* the client module
const ProfileDialog = dynamic(() => import('./ProfileDialog'), { 
    ssr: false,
    loading: () => null,
});

export default function ProfileDialogClient(props: ProfileDialogProps) {
    if (!props.open || typeof document === 'undefined') {
        return null;
    }

    return <ProfileDialog {...props} />;
}