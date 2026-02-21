'use client';

import { useState, useRef, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { Loader2, Image as ImageIcon, X, Lock } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { getMatrixClient } from '../../lib/matrix';
import { createClient } from '../../lib/supabase/client';

interface ComposePostModalProps {
    children: React.ReactNode;
    defaultRoomId?: string;
    onPostCreated?: () => void;
    replyToEventId?: string;
}

export function ComposePostModal({ children, defaultRoomId, onPostCreated, replyToEventId }: ComposePostModalProps) {
    const [open, setOpen] = useState(false);
    const [content, setContent] = useState('');
    const [isPosting, setIsPosting] = useState(false);
    const [hasWarning, setHasWarning] = useState(false);
    const [warningText, setWarningText] = useState('');
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [accessLevel, setAccessLevel] = useState<string>('public');
    const [price, setPrice] = useState<string>('');
    const [collectionId, setCollectionId] = useState<string>('none');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Auth State
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

    const ROOM_ID = defaultRoomId || process.env.NEXT_PUBLIC_MATRIX_GLOBAL_ROOM_ID || '!iyDNoJTahsHwSkiukz:localhost';

    useEffect(() => {
        const fetchUser = async () => {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data } = await supabase.from('profiles').select('avatar_url').eq('id', user.id).single();
                if (data?.avatar_url) setAvatarUrl(data.avatar_url);
            }
        };
        fetchUser();
    }, []);

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setSelectedImage(file);

        // Create preview
        const reader = new FileReader();
        reader.onloadend = () => {
            setImagePreview(reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    const removeImage = () => {
        setSelectedImage(null);
        setImagePreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handlePost = async () => {
        if ((!content.trim() && !selectedImage)) return;

        setIsPosting(true);
        try {
            const matrixClient = await getMatrixClient();
            if (!matrixClient) throw new Error("Matrix client not available");

            let currentRoomId = ROOM_ID;

            // Auto join if needed (for global room)
            try {
                await matrixClient.joinRoom(currentRoomId);
            } catch (err) {
                // Ignore join errors assuming we are already in the room
            }

            let relatesTo = undefined;
            if (replyToEventId) {
                let rootId = replyToEventId;
                let inReplyToId = replyToEventId;

                try {
                    let currentTargetId = replyToEventId;
                    let targetEvent = await matrixClient.fetchRoomEvent(currentRoomId, currentTargetId);

                    let depth = 0;
                    while (targetEvent?.content?.["m.relates_to"]?.event_id && depth < 5) {
                        const rel = targetEvent.content["m.relates_to"];
                        if (rel.event_id) currentTargetId = rel.event_id;

                        if (depth === 0 && rel.rel_type === "m.reference") {
                            inReplyToId = currentTargetId;
                        }

                        targetEvent = await matrixClient.fetchRoomEvent(currentRoomId, currentTargetId);
                        depth++;
                    }
                    rootId = currentTargetId;
                } catch (e) {
                    console.log("Could not fetch target event for thread resolution", e);
                }

                relatesTo = {
                    "rel_type": "m.thread",
                    "event_id": rootId,
                    "is_falling_back": true,
                    "m.in_reply_to": {
                        "event_id": inReplyToId
                    }
                };
            }

            // Create strictly sanitized base payloads without explicit undefined keys
            const buildPayload = (baseMsg: any) => {
                const payload: any = {
                    ...baseMsg,
                    access_level: accessLevel,
                };
                if (hasWarning) {
                    payload["org.crabba.content_warning"] = warningText || "Sensitive Content";
                }
                if (accessLevel === 'premium' && price) {
                    payload.price = parseFloat(price);
                }
                if (collectionId !== 'none') {
                    payload.collection_id = collectionId;
                }
                if (relatesTo) {
                    payload["m.relates_to"] = relatesTo;
                }
                return payload;
            };

            // If it's just text
            if (!selectedImage) {
                let body = content;
                if (hasWarning) {
                    body = `[Content Warning: ${warningText || 'Sensitive Content'}]\n\n${content}`;
                }

                const msgPayload = buildPayload({
                    msgtype: "m.text",
                    body: body,
                });
                await matrixClient.sendEvent(currentRoomId, "m.room.message" as any, msgPayload);

            } else {
                // Image Upload Flow
                const response = await matrixClient.uploadContent(selectedImage);
                const contentUri = response.content_uri;

                let body = selectedImage.name;
                if (content.trim()) body = content;
                if (hasWarning) {
                    body = `[Content Warning: ${warningText || 'Sensitive Content'}]\n\n${body}`;
                }

                const imgPayload = buildPayload({
                    msgtype: "m.image",
                    body: body,
                    url: contentUri,
                    info: {
                        mimetype: selectedImage.type,
                        size: selectedImage.size
                    }
                });
                await matrixClient.sendEvent(currentRoomId, "m.room.message" as any, imgPayload);
            }

            setContent('');
            setHasWarning(false);
            setWarningText('');
            setAccessLevel('public');
            setPrice('');
            setCollectionId('none');
            removeImage();
            setOpen(false);
            if (onPostCreated) onPostCreated();
        } catch (error) {
            console.error("Failed to post:", error);
            alert("Failed to post. Please try again.");
        } finally {
            setIsPosting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] bg-neutral-950 border-neutral-800 text-white p-0 overflow-hidden">
                <DialogHeader className="p-4 border-b border-neutral-800">
                    <DialogTitle className="text-xl font-bold">Compose Post</DialogTitle>
                </DialogHeader>

                <div className="p-4 flex gap-4">
                    <Avatar className="w-10 h-10 shrink-0">
                        <AvatarImage src={avatarUrl || ''} />
                        <AvatarFallback className="bg-neutral-800">U</AvatarFallback>
                    </Avatar>

                    <div className="flex-1 space-y-4">
                        <Textarea
                            placeholder="What's happening?"
                            className="bg-transparent border-none resize-none focus-visible:ring-0 text-lg min-h-[120px] p-0 placeholder-neutral-500"
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                        />

                        {imagePreview && (
                            <div className="relative rounded-xl overflow-hidden border border-neutral-800 bg-neutral-900 group">
                                <img src={imagePreview} alt="Preview" className="w-full max-h-[300px] object-cover" />
                                <button
                                    onClick={removeImage}
                                    className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 rounded-full text-white backdrop-blur-sm transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )}

                        {hasWarning && (
                            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3">
                                <Label className="text-xs text-neutral-400 uppercase tracking-wider mb-2 block">Content Warning Label</Label>
                                <input
                                    type="text"
                                    placeholder="e.g. Spoilers, NSFW, Flash Warning"
                                    className="w-full bg-transparent border-b border-neutral-700 pb-1 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                                    value={warningText}
                                    onChange={(e) => setWarningText(e.target.value)}
                                    maxLength={50}
                                />
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-4 border-t border-neutral-800 bg-neutral-900/30 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div className="flex gap-2">
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept="image/*"
                                onChange={handleImageSelect}
                            />
                            <Button
                                variant="ghost"
                                size="icon"
                                className="text-blue-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-full"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isPosting || selectedImage !== null}
                                title="Add Image"
                            >
                                <ImageIcon className="w-5 h-5" />
                            </Button>
                        </div>

                        <div className="h-6 w-px bg-neutral-800" />

                        <div className="flex items-center gap-2">
                            <Switch
                                id="content-warning"
                                checked={hasWarning}
                                onCheckedChange={setHasWarning}
                                className="data-[state=checked]:bg-orange-500"
                            />
                            <Label htmlFor="content-warning" className="text-sm cursor-pointer text-neutral-400 hover:text-neutral-200 transition-colors">
                                Add Warning
                            </Label>
                        </div>

                        <div className="h-6 w-px bg-neutral-800" />

                        <div className="flex items-center gap-2">
                            <Select value={accessLevel} onValueChange={setAccessLevel}>
                                <SelectTrigger className="w-[120px] bg-neutral-900 border-neutral-800 text-xs h-8">
                                    <SelectValue placeholder="Access Level" />
                                </SelectTrigger>
                                <SelectContent className="bg-neutral-900 border-neutral-800 text-white">
                                    <SelectItem value="public">🌍 Public</SelectItem>
                                    <SelectItem value="premium">🔒 Premium</SelectItem>
                                </SelectContent>
                            </Select>

                            {accessLevel === 'premium' && (
                                <div className="flex items-center gap-1 border border-neutral-800 rounded-md bg-neutral-900 px-2 h-8 w-[100px]">
                                    <span className="text-neutral-500 text-xs">$</span>
                                    <input
                                        type="number"
                                        placeholder="Price"
                                        value={price}
                                        onChange={(e) => setPrice(e.target.value)}
                                        className="bg-transparent border-none focus:outline-none text-xs w-full text-white"
                                        min="0"
                                        step="1"
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    <Button
                        onClick={handlePost}
                        disabled={(!content.trim() && !selectedImage) || isPosting || (hasWarning && !warningText.trim())}
                        className="rounded-full bg-blue-500 hover:bg-blue-600 font-bold px-8"
                    >
                        {isPosting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Post'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
