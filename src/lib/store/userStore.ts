import { mockUsers } from "@/data/mockUsers";
import type { User } from "@/types/rbac";

const STORAGE_KEY = "octagem.users.local";

function readAll(): User[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as User[];
  } catch {
    // fall through to reseed
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mockUsers));
  return mockUsers;
}

function writeAll(users: User[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
}

export function getAll(): User[] {
  return readAll();
}

export function getById(id: string): User | undefined {
  return readAll().find((u) => u.id === id);
}

export function findByEmail(email: string): User | undefined {
  const normalized = email.trim().toLowerCase();
  return readAll().find((u) => u.email.toLowerCase() === normalized);
}

export function insert(user: User): User {
  const users = readAll();
  users.push(user);
  writeAll(users);
  return user;
}

export function update(id: string, patch: Partial<User>): User | undefined {
  const users = readAll();
  const index = users.findIndex((u) => u.id === id);
  if (index === -1) return undefined;
  users[index] = { ...users[index], ...patch };
  writeAll(users);
  return users[index];
}

export function nextUserId(): string {
  const numbers = readAll()
    .map((u) => Number(u.id.replace("USER-", "")))
    .filter((n) => !Number.isNaN(n));
  return `USER-${(numbers.length ? Math.max(...numbers) : 1) + 1}`;
}
