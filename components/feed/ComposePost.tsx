import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Image as ImageIcon, X } from 'lucide-react';

interface ComposePostProps {
    matrixClient: any;
    roomId: string; // The room ID passed from parent
    onPostCreated: () => void;
}

export function ComposePost({ matrixClient, roomId, onPostCreated }: ComposePostProps) {
    const [content, setContent] = useState('');
    const [isPosting, setIsPosting] = useState(false);
    const [mediaFiles, setMediaFiles] = useState<File[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handlePost = async () => {
        if ((!content.trim() && mediaFiles.length === 0) || !matrixClient) return;

        setIsPosting(true);
        try {
            const mediaArray: Array<{ url: string; type: string; info: any }> = [];

            if (mediaFiles.length > 0) {
                // Upload all files concurrently
                const uploadPromises = mediaFiles.map(async (file) => {
                    const response = await matrixClient.uploadContent(file);
                    return {
                        url: response.content_uri,
                        type: file.type,
                        info: { mimetype: file.type, size: file.size }
                    };
                });
                const results = await Promise.all(uploadPromises);
                mediaArray.push(...results);
            }

            // Construct payload
            const payload: any = {
                msgtype: mediaArray.length > 0 ? (mediaArray[0].type.startsWith('video') ? "m.video" : "m.image") : "m.text",
                body: content || (mediaArray.length > 0 ? "Media message" : ""),
            };

            if (mediaArray.length > 0) {
                // Attach array of media items to custom field
                payload['crabba.media'] = mediaArray;

                // Legacy fallback: attach the FIRST item to the root fields
                payload.url = mediaArray[0].url;
                payload.info = mediaArray[0].info;
            }

            await matrixClient.sendEvent(roomId, "m.room.message", payload);

            setContent('');
            setMediaFiles([]);
            onPostCreated();
        } catch (error) {
            console.error("Failed to send message:", error);
        } finally {
            setIsPosting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files) return;

        const selected = Array.from(e.target.files);
        // Calculate how many more files we can add
        const remainingSlots = 4 - mediaFiles.length;
        if (remainingSlots <= 0) return;

        const filesToAdd = selected.slice(0, remainingSlots);
        setMediaFiles(prev => [...prev, ...filesToAdd]);

        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const removeFile = (index: number) => {
        setMediaFiles(prev => prev.filter((_, i) => i !== index));
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

                    {mediaFiles.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                            {mediaFiles.map((file, idx) => (
                                <div key={idx} className="relative w-20 h-20 rounded-md overflow-hidden bg-neutral-900 border border-neutral-800">
                                    {file.type.startsWith('video') ? (
                                        <video src={URL.createObjectURL(file)} className="w-full h-full object-cover" />
                                    ) : (
                                        <img src={URL.createObjectURL(file)} className="w-full h-full object-cover" alt="Preview" />
                                    )}
                                    <button
                                        className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 p-1 rounded-full text-white transition-colors"
                                        onClick={() => removeFile(idx)}
                                        disabled={isPosting}
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="flex justify-between items-center border-t border-neutral-800 pt-3">
                        <div className="flex gap-2 text-orange-500">
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept="image/*,video/*"
                                multiple
                                onChange={handleFileChange}
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
                            disabled={(!content.trim() && mediaFiles.length === 0) || isPosting}
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
