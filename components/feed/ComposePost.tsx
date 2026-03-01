import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Image as ImageIcon } from 'lucide-react';

interface ComposePostProps {
    matrixClient: any;
    roomId: string; // The room ID passed from parent
    onPostCreated: () => void;
}

export function ComposePost({ matrixClient, roomId, onPostCreated }: ComposePostProps) {
    const [content, setContent] = useState('');
    const [isPosting, setIsPosting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handlePost = async () => {
        if (!content.trim() || !matrixClient) return;

        setIsPosting(true);
        try {
            await matrixClient.sendEvent(roomId, "m.room.message", {
                msgtype: "m.text",
                body: content,
            });
            setContent('');
            onPostCreated();
        } catch (error) {
            console.error("Failed to send message:", error);
        } finally {
            setIsPosting(false);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !matrixClient) return;

        setIsPosting(true);
        try {
            // 1. Upload the file to Matrix Media Repository
            const response = await matrixClient.uploadContent(file);
            const contentUri = response.content_uri;

            // 2. Send the connection event
            await matrixClient.sendEvent(roomId, "m.room.message", {
                msgtype: "m.image",
                body: file.name,
                url: contentUri,
                info: {
                    mimetype: file.type,
                    size: file.size
                }
            });

            onPostCreated();
        } catch (error) {
            console.error("Failed to upload image:", error);
        } finally {
            setIsPosting(false);
            // Reset input
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <div className="border-b border-neutral-800 p-4">
            <div className="flex gap-4">
                <Avatar className="w-10 h-10">
                    <AvatarImage src="https://github.com/shadcn.png" />
                    <AvatarFallback>U</AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-4">
                    <Textarea
                        placeholder="What's happening?"
                        className="bg-transparent border-none resize-none focus-visible:ring-0 text-lg min-h-[80px] p-0 placeholder-neutral-500"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                    />
                    <div className="flex justify-between items-center border-t border-neutral-800 pt-3">
                        <div className="flex gap-2 text-orange-500">
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept="image/*"
                                onChange={handleImageUpload}
                            />
                            <Button
                                variant="ghost"
                                size="icon"
                                className="text-orange-500 hover:text-orange-400 hover:bg-orange-500/10 rounded-full"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isPosting}
                            >
                                <ImageIcon className="w-5 h-5" />
                            </Button>
                        </div>
                        <Button
                            onClick={handlePost}
                            disabled={!content.trim() || isPosting}
                            className="rounded-full bg-orange-600 hover:bg-orange-700 font-bold px-6"
                        >
                            {isPosting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Uploading...</> : 'Post'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
