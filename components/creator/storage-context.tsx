"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Where the lecturer's desk keeps its data, decided once on the server by
 * app/(creator)/layout.tsx:
 *   database  PostgreSQL through the route handlers (DATABASE_URL set, lecturers sign in):
 *             quizzes via /api/quizzes, images via /api/media, profile in the users table
 *   browser   memory mode: quizzes in this browser (localStorage + seeds), images as
 *             inline data URLs, profile edits in a cookie
 * Live games run on the game server in both modes.
 */
export type CreatorStorage = "database" | "browser";

const StorageContext = createContext<CreatorStorage>("browser");

export function CreatorStorageProvider({ storage, children }: { storage: CreatorStorage; children: ReactNode }) {
  return <StorageContext value={storage}>{children}</StorageContext>;
}

export function useCreatorStorage(): CreatorStorage {
  return useContext(StorageContext);
}
