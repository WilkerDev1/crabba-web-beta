import * as React from "react"
import { Loader2 } from "lucide-react"
import { Button } from "./button"

interface ConfirmDeleteModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
    isDeleting: boolean;
    title?: string;
    description?: string;
}

export function ConfirmDeleteModal({
    open,
    onOpenChange,
    onConfirm,
    isDeleting,
    title = "Delete Post?",
    description = "This action cannot be undone. This post will be permanently removed from the timeline."
}: ConfirmDeleteModalProps) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                onClick={() => !isDeleting && onOpenChange(false)}
            />

            {/* Modal Dialog */}
            <div className="z-50 w-full max-w-md mx-auto p-6 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl relative transform transition-all duration-300 scale-100 opacity-100">
                <h2 className="text-xl font-bold text-white mb-2">{title}</h2>
                <p className="text-neutral-400 text-sm mb-6">
                    {description}
                </p>

                <div className="flex justify-end gap-3 mt-4">
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        disabled={isDeleting}
                        className="text-neutral-300 hover:bg-neutral-800 hover:text-white"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={() => onConfirm()}
                        disabled={isDeleting}
                        className="bg-red-600 hover:bg-red-700 text-white font-medium min-w-[100px]"
                    >
                        {isDeleting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Eliminating...
                            </>
                        ) : (
                            "Delete"
                        )}
                    </Button>
                </div>
            </div>
        </div>
    )
}
