'use client';

import { useEffect, useState, use } from 'react';
import { getMatrixClient } from '@/lib/matrix';
import { PostCard } from '@/components/feed/PostCard';
import { AppShell } from '@/components/layout/AppShell';
import { GlobalTimeline } from '@/components/feed/GlobalTimeline';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Box, Users } from 'lucide-react';

export default function FanboxPage() {

    return (
        <AppShell>
            <div className="sticky top-0 z-10 backdrop-blur-md bg-black/70 border-b border-neutral-800 p-4">
                <div className="flex items-center gap-2 mb-1">
                    <Box className="w-6 h-6 text-orange-500" />
                    <h1 className="text-xl font-bold text-white">Fanbox</h1>
                </div>
                <p className="text-sm text-neutral-400">Discover premium content and support creators.</p>
            </div>

            <Tabs defaultValue="posts" className="w-full">
                <div className="border-b border-neutral-800 px-4">
                    <TabsList className="bg-transparent h-12 w-full justify-start gap-6">
                        <TabsTrigger value="posts" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-orange-500 rounded-none px-0 font-bold text-neutral-400 data-[state=active]:text-white">
                            Global Feed
                        </TabsTrigger>
                        <TabsTrigger value="creators" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-orange-500 rounded-none px-0 font-bold text-neutral-400 data-[state=active]:text-white">
                            Recommended Creators
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="posts" className="m-0 border-none p-0 outline-none">
                    {/* We can re-use GlobalTimeline to render posts. The PostCard naturally blurs premium ones */}
                    <GlobalTimeline filterType="all" />
                </TabsContent>

                <TabsContent value="creators" className="m-0 p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[1, 2, 3, 4].map((i) => (
                            <Card key={i} className="bg-neutral-900 border-neutral-800 p-6 flex flex-col items-center text-center hover:bg-neutral-900/80 transition-colors">
                                <Avatar className="w-20 h-20 mb-4 rounded-xl">
                                    <AvatarFallback className="bg-neutral-800 text-neutral-400 text-2xl rounded-xl">C{i}</AvatarFallback>
                                </Avatar>
                                <h3 className="text-white font-bold text-lg">Creator {i}</h3>
                                <p className="text-neutral-500 text-sm mb-4">Digital Artist & Illustrator. Creating high-res fantasy art.</p>
                                <div className="flex gap-4 text-sm text-neutral-400 mb-6">
                                    <span><span className="font-bold text-white">12{i}</span> Posts</span>
                                    <span><span className="font-bold text-white">4.{i}K</span> Followers</span>
                                </div>
                                <Button className="w-full bg-orange-500 hover:bg-orange-600 text-white rounded-full">
                                    View Fanbox
                                </Button>
                            </Card>
                        ))}
                    </div>
                </TabsContent>
            </Tabs>
        </AppShell>
    );
}
