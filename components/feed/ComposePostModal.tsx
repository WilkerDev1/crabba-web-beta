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
import { Loader2, Image as ImageIcon, X, Lock, Video } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { getMatrixClient, sendEventWithRetry } from '../../lib/matrix';
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
    const [selectedMedia, setSelectedMedia] = useState<File | null>(null);
    const [mediaPreview, setMediaPreview] = useState<string | null>(null);
    const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
    const [isDragging, setIsDragging] = useState(false);
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

    /** Core file handler — used by both <input> and drag-and-drop */
    const handleFile = async (file: File) => {
        if (selectedMedia) return; // Already have media selected

        const isVideo = file.type.startsWith('video/');
        const isImage = file.type.startsWith('image/');

        if (!isVideo && !isImage) {
            alert('Formato no soportado. Usa imágenes o videos.');
            return;
        }

        if (isVideo) {
            // Pre-upload validation: check video duration
            try {
                const duration = await getVideoDuration(file);
                if (duration > 180) {
                    alert('Video excede el límite de 3 minutos para cuidar el servidor.');
                    return;
                }
            } catch (err) {
                console.error('Could not read video duration:', err);
                alert('No se pudo leer el video. Intenta con otro archivo.');
                return;
            }
            setMediaType('video');
        } else {
            setMediaType('image');
        }

        setSelectedMedia(file);
        setMediaPreview(URL.createObjectURL(file));
    };

    const handleMediaSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) await handleFile(file);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) await handleFile(file);
    };

    /** Use HTMLVideoElement to read duration without uploading */
    const getVideoDuration = (file: File): Promise<number> => {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.onloadedmetadata = () => {
                URL.revokeObjectURL(video.src);
                resolve(video.duration);
            };
            video.onerror = () => {
                URL.revokeObjectURL(video.src);
                reject(new Error('Failed to load video metadata'));
            };
            video.src = URL.createObjectURL(file);
        });
    };

    const removeMedia = () => {
        if (mediaPreview) URL.revokeObjectURL(mediaPreview);
        setSelectedMedia(null);
        setMediaPreview(null);
        setMediaType(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handlePost = async () => {
        if ((!content.trim() && !selectedMedia)) return;

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
                const inReplyToId = replyToEventId; // Always the exact comment clicked

                try {
                    // BULLETPROOF THREAD ROOT DISCOVERY
                    // Rule: m.thread.event_id MUST point to an event that has NO m.thread relation itself.
                    // Strategy:
                    //   1. If target has m.thread → COPY its event_id exactly (it already points to root).
                    //   2. If target has only m.in_reply_to → walk UP via m.in_reply_to until we find
                    //      either (a) an event with m.thread (copy its root), or (b) an event with NO
                    //      m.relates_to at all (that IS the absolute root).
                    //   3. If target has no m.relates_to → IT is the root.
                    const room = matrixClient.getRoom(currentRoomId);

                    const getContent = async (eId: string): Promise<any> => {
                        const cached = room?.findEventById(eId);
                        if (cached) return cached.getContent();
                        try {
                            const raw = await matrixClient.fetchRoomEvent(currentRoomId, eId);
                            return raw.content || null;
                        } catch { return null; }
                    };

                    const targetContent = await getContent(replyToEventId);
                    const targetRel = targetContent?.['m.relates_to'];

                    if (targetRel?.rel_type === 'm.thread' && targetRel?.event_id) {
                        // Case 1: Target is already in a thread → just copy its root
                        rootId = targetRel.event_id;
                    } else if (targetRel?.['m.in_reply_to']?.event_id) {
                        // Case 2: Target is a simple reply (no m.thread). Walk up.
                        let currentId = targetRel['m.in_reply_to'].event_id;
                        let depth = 0;
                        while (currentId && depth < 10) {
                            const parentContent = await getContent(currentId);
                            const parentRel = parentContent?.['m.relates_to'];

                            if (parentRel?.rel_type === 'm.thread' && parentRel?.event_id) {
                                // Found a thread member — copy ITS root
                                rootId = parentRel.event_id;
                                break;
                            } else if (!parentRel) {
                                // No relations at all — THIS is the absolute root
                                rootId = currentId;
                                break;
                            } else if (parentRel?.['m.in_reply_to']?.event_id) {
                                // Has a parent — keep walking up
                                currentId = parentRel['m.in_reply_to'].event_id;
                            } else {
                                // Has some relation but no parent pointer — treat as root
                                rootId = currentId;
                                break;
                            }
                            depth++;
                        }
                    }
                    // Case 3: Target has no m.relates_to → rootId stays as replyToEventId

                    // FINAL SAFETY CHECK: Verify the rootId event has NO m.thread relation
                    if (rootId !== replyToEventId) {
                        const rootContent = await getContent(rootId);
                        const rootRel = rootContent?.['m.relates_to'];
                        if (rootRel?.rel_type === 'm.thread') {
                            // This "root" is actually a thread member! Use ITS root instead.
                            console.warn('⚠️ Safety check caught bad root — using upstream root');
                            rootId = rootRel.event_id;
                        }
                    }
                } catch (e) {
                    console.log("Error resolving thread root, using target as root", e);
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
            if (!selectedMedia) {
                let body = content;
                if (hasWarning) {
                    body = `[Content Warning: ${warningText || 'Sensitive Content'}]\n\n${content}`;
                }

                const msgPayload = buildPayload({
                    msgtype: "m.text",
                    body: body,
                });
                await sendEventWithRetry(currentRoomId, "m.room.message", msgPayload);

            } else {
                // Media Upload Flow (Image or Video)
                const response = await matrixClient.uploadContent(selectedMedia);
                const contentUri = response.content_uri;

                let body = selectedMedia.name;
                if (content.trim()) body = content;
                if (hasWarning) {
                    body = `[Content Warning: ${warningText || 'Sensitive Content'}]\n\n${body}`;
                }

                const isVideo = mediaType === 'video';
                const mediaPayload = buildPayload({
                    msgtype: isVideo ? "m.video" : "m.image",
                    body: body,
                    url: contentUri,
                    info: {
                        mimetype: selectedMedia.type,
                        size: selectedMedia.size
                    }
                });
                await sendEventWithRetry(currentRoomId, "m.room.message", mediaPayload);
            }

            setContent('');
            setHasWarning(false);
            setWarningText('');
            setAccessLevel('public');
            setPrice('');
            setCollectionId('none');
            removeMedia();
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
            <DialogContent
                className={`sm:max-w-[600px] bg-neutral-950 border-neutral-800 text-white p-0 overflow-hidden transition-colors ${isDragging ? 'ring-2 ring-blue-500 ring-dashed' : ''}`}
                onDragOver={(e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
            >
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

                        {mediaPreview && (
                            <div className="relative rounded-xl overflow-hidden border border-neutral-800 bg-neutral-900 group">
                                {mediaType === 'video' ? (
                                    <video src={mediaPreview} className="w-full max-h-[350px] object-contain rounded-xl" controls preload="metadata" />
                                ) : (
                                    <img src={mediaPreview} alt="Preview" className="w-full max-h-[350px] object-contain rounded-xl" />
                                )}
                                <button
                                    onClick={removeMedia}
                                    className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 rounded-full text-white backdrop-blur-sm transition-colors z-10"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )}

                        {/* Drag-and-drop hint */}
                        {isDragging && !mediaPreview && (
                            <div className="flex items-center justify-center h-32 border-2 border-dashed border-orange-500 rounded-xl bg-orange-500/10 text-orange-400 text-sm font-medium">
                                Suelta tu archivo aquí
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
                                accept="image/*,video/*,.mp4,.mov,.webm,.mkv"
                                onChange={handleMediaSelect}
                            />
                            <Button
                                variant="ghost"
                                size="icon"
                                className="text-orange-500 hover:text-orange-400 hover:bg-orange-500/10 rounded-full"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isPosting || selectedMedia !== null}
                                title="Add Image or Video"
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
                        disabled={(!content.trim() && !selectedMedia) || isPosting || (hasWarning && !warningText.trim())}
                        className="rounded-full bg-orange-600 hover:bg-orange-700 font-bold px-8"
                    >
                        {isPosting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Post'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
