import type { AnswerOption, Question, Quiz } from "@/lib/game/types";
import { hashString } from "@/lib/random";

/**
 * Seed content used by demo mode, the local repository, tests and the first-boot import
 * of the admin's demo quizzes (lib/server/bootstrap.ts).
 * All ids are stable so tests and URLs can reference them.
 */

export const DEMO_OWNER_ID = "00000000-0000-4000-8000-000000000001";
export const DEMO_LECTURER = {
  id: DEMO_OWNER_ID,
  fullName: "Laras Wicaksono",
  salutation: "Bu",
  title: "S.Kom., M.T.I.",
  email: "laras.wicaksono@example.ac.id",
  faculty: "School of Computer Science",
};

const opts = (qid: string, texts: string[], correct: number | number[], ordering = false): AnswerOption[] => {
  const correctSet = new Set(Array.isArray(correct) ? correct : [correct]);
  return texts.map((text, i) => ({
    // Players see option ids. For ordering, "-a1, -a2, …" sorted would BE the solution,
    // so those ids are opaque (still stable) instead.
    id: ordering ? `${qid}-o${hashString(`${qid}:${text}`).toString(36)}` : `${qid}-a${i + 1}`,
    position: i,
    text,
    isCorrect: correctSet.has(i),
  }));
};

const q = (
  quizKey: string,
  n: number,
  data: Omit<Question, "id" | "position" | "answers"> & { options?: string[]; correct?: number | number[] },
): Question => {
  const id = `${quizKey}-q${String(n).padStart(2, "0")}`;
  const { options, correct, ...rest } = data;
  return {
    id,
    position: n - 1,
    answers: options ? opts(id, options, correct ?? 0, data.type === "ordering") : [],
    ...rest,
  };
};

const TS = "2026-09-01T08:00:00.000Z";

/* ------------------------------------------------------------------ */
/* Flagship demo: OS Battle                                            */
/* ------------------------------------------------------------------ */

export const OS_BATTLE: Quiz = {
  id: "os-battle",
  ownerId: DEMO_OWNER_ID,
  title: "OS Battle: Scheduling & Concurrency",
  description:
    "Sepuluh soal kilat untuk menguji pemahaman CPU scheduling dan sinkronisasi proses sebelum kuis mingguan.",
  course: {
    courseCode: "COMP6716",
    courseName: "Operating Systems",
    className: "LA01",
    lecturer: "Laras Wicaksono",
    learningOutcome: "LO2 — Menganalisis algoritma penjadwalan dan mekanisme sinkronisasi proses",
  },
  topic: "CPU Scheduling & Concurrency",
  difficulty: "sedang",
  language: "id",
  visibility: "private",
  mode: "classic",
  createdAt: TS,
  updatedAt: TS,
  questions: [
    q("os", 1, {
      type: "single",
      topic: "FCFS",
      prompt: "Pada algoritma FCFS, proses mana yang dieksekusi paling dulu?",
      options: [
        "Proses dengan burst time terpendek",
        "Proses yang paling awal tiba di ready queue",
        "Proses dengan prioritas tertinggi",
        "Proses yang paling lama menunggu I/O",
      ],
      correct: 1,
      explanation:
        "First Come, First Served melayani proses sesuai urutan kedatangan. Sifatnya non-preemptive, sehingga proses panjang di depan bisa menimbulkan convoy effect.",
      timeLimit: 20,
      points: 1000,
    }),
    q("os", 2, {
      type: "single",
      topic: "SJF",
      prompt:
        "P1, P2, P3 tiba bersamaan dengan burst time 6, 2, dan 4 ms. Dengan SJF non-preemptive, berapa average waiting time-nya?",
      options: ["2,67 ms", "4,00 ms", "3,33 ms", "4,67 ms"],
      correct: 0,
      explanation:
        "Urutan eksekusi P2 → P3 → P1. Waiting time: P2 = 0, P3 = 2, P1 = 6. Rata-rata (0 + 2 + 6) / 3 = 2,67 ms.",
      timeLimit: 30,
      points: 1000,
    }),
    q("os", 3, {
      type: "single",
      topic: "SRTF",
      prompt: "Shortest Remaining Time First (SRTF) adalah versi preemptive dari algoritma…",
      options: ["FCFS", "Round Robin", "SJF", "Priority Scheduling"],
      correct: 2,
      explanation:
        "SRTF adalah SJF yang preemptive: jika proses baru tiba dengan sisa burst lebih pendek, proses yang sedang berjalan disela.",
      timeLimit: 20,
      points: 1000,
    }),
    q("os", 4, {
      type: "single",
      topic: "Round Robin",
      prompt: "Algoritma scheduling mana yang menggunakan time quantum?",
      options: ["FCFS", "Round Robin", "SJF", "HRRN"],
      correct: 1,
      explanation:
        "Round Robin memberi setiap proses jatah waktu (time quantum) bergiliran. Quantum terlalu kecil memperbanyak context switch; terlalu besar membuatnya mirip FCFS.",
      timeLimit: 20,
      points: 1000,
    }),
    q("os", 5, {
      type: "single",
      topic: "Race Condition",
      prompt: "Race condition terjadi ketika…",
      options: [
        "Dua proses berebut CPU dengan prioritas yang sama",
        "Hasil eksekusi bergantung pada urutan akses beberapa thread ke data bersama",
        "Sebuah proses menunggu I/O terlalu lama",
        "Scheduler memilih proses secara acak",
      ],
      correct: 1,
      explanation:
        "Race condition muncul saat beberapa thread mengakses dan mengubah data bersama tanpa sinkronisasi, sehingga hasil akhirnya bergantung pada interleaving.",
      timeLimit: 20,
      points: 1000,
    }),
    q("os", 6, {
      type: "single",
      topic: "Mutex",
      prompt: "Apa fungsi utama mutex?",
      options: [
        "Menjamin hanya satu thread berada di critical section pada satu waktu",
        "Mempercepat context switch antar-proses",
        "Membagi memori fisik antar-proses",
        "Menghitung jumlah resource yang masih tersedia",
      ],
      correct: 0,
      explanation:
        "Mutex (mutual exclusion lock) memastikan akses eksklusif ke critical section. Menghitung resource tersedia adalah peran counting semaphore.",
      timeLimit: 20,
      points: 1000,
    }),
    q("os", 7, {
      type: "true_false",
      topic: "Semaphore",
      prompt: "Operasi wait() pada semaphore yang bernilai 0 akan memblokir proses pemanggilnya.",
      options: ["Benar", "Salah"],
      correct: 0,
      explanation:
        "wait() (P) mengurangi nilai semaphore. Jika nilainya 0, tidak ada resource tersedia, sehingga proses diblokir hingga ada signal().",
      timeLimit: 15,
      points: 1000,
    }),
    q("os", 8, {
      type: "single",
      topic: "Deadlock",
      prompt: "Manakah yang BUKAN termasuk empat kondisi Coffman penyebab deadlock?",
      options: ["Mutual exclusion", "Hold and wait", "Preemption", "Circular wait"],
      correct: 2,
      explanation:
        "Kondisinya adalah no preemption: resource tidak dapat direbut paksa. Jika preemption diizinkan, salah satu syarat deadlock justru patah.",
      timeLimit: 20,
      points: 1000,
    }),
    q("os", 9, {
      type: "multiple",
      topic: "Producer–Consumer",
      prompt: "Pada solusi bounded-buffer klasik, pilih DUA semaphore yang bertipe counting.",
      options: ["empty", "mutex", "full", "time_quantum"],
      correct: [0, 2],
      explanation:
        "empty (awal = n) menghitung slot kosong dan full (awal = 0) menghitung slot terisi. mutex adalah binary semaphore untuk akses buffer.",
      timeLimit: 30,
      points: 1000,
    }),
    q("os", 10, {
      type: "single",
      topic: "Dining Philosophers",
      prompt: "Strategi mana yang mencegah deadlock pada Dining Philosophers?",
      options: [
        "Semua filsuf mengambil garpu kiri terlebih dahulu",
        "Filsuf bernomor ganjil mengambil garpu kiri dulu, yang genap garpu kanan dulu",
        "Memperpanjang waktu makan setiap filsuf",
        "Filsuf mengambil garpu tanpa menunggu giliran",
      ],
      correct: 1,
      explanation:
        "Urutan pengambilan yang asimetris memutus circular wait. Jika semua mengambil garpu kiri bersamaan, setiap filsuf menunggu garpu kanan selamanya.",
      timeLimit: 30,
      points: 2000,
    }),
  ],
};

/* ------------------------------------------------------------------ */
/* Library examples                                                    */
/* ------------------------------------------------------------------ */

export const CLOUD_QUIZ: Quiz = {
  id: "cloud-fundamentals",
  ownerId: DEMO_OWNER_ID,
  title: "Cloud Service Models Sprint",
  description: "IaaS, PaaS, SaaS, dan elastisitas dalam lima menit.",
  course: { courseCode: "COMP6624", courseName: "Cloud Computing", className: "LB03" },
  topic: "Service Models",
  difficulty: "mudah",
  language: "id",
  visibility: "private",
  mode: "classic",
  createdAt: "2026-08-20T03:00:00.000Z",
  updatedAt: "2026-09-12T03:00:00.000Z",
  questions: [
    q("cloud", 1, {
      type: "single",
      topic: "Service Models",
      prompt: "Mahasiswa men-deploy aplikasi Next.js tanpa mengelola server. Ini contoh model layanan…",
      options: ["IaaS", "PaaS", "SaaS", "On-premise"],
      correct: 1,
      explanation: "PaaS menyediakan runtime terkelola; pengembang cukup fokus pada kode aplikasinya.",
      timeLimit: 20,
      points: 1000,
    }),
    q("cloud", 2, {
      type: "true_false",
      topic: "Elasticity",
      prompt: "Elasticity berarti kapasitas bisa bertambah dan berkurang otomatis mengikuti beban.",
      options: ["Benar", "Salah"],
      correct: 0,
      timeLimit: 15,
      points: 1000,
    }),
    q("cloud", 3, {
      type: "single",
      topic: "Shared Responsibility",
      prompt: "Pada IaaS, siapa yang bertanggung jawab melakukan patch sistem operasi VM?",
      options: ["Penyedia cloud", "Pelanggan", "Keduanya tidak", "Otomatis oleh hypervisor"],
      correct: 1,
      timeLimit: 20,
      points: 1000,
    }),
  ],
};

export const ALGO_QUIZ: Quiz = {
  id: "algo-loops",
  ownerId: DEMO_OWNER_ID,
  title: "Looping & Array Warm-up",
  description: "Pemanasan sebelum praktikum: perulangan, indeks array, dan kompleksitas dasar.",
  course: { courseCode: "COMP6047", courseName: "Algorithm and Programming", className: "LC05" },
  topic: "Looping",
  difficulty: "mudah",
  language: "id",
  visibility: "private",
  mode: "classic",
  createdAt: "2026-08-28T03:00:00.000Z",
  updatedAt: "2026-09-10T03:00:00.000Z",
  questions: [
    q("algo", 1, {
      type: "numeric",
      topic: "Looping",
      prompt: "Berapa kali perulangan for (int i = 0; i < 10; i += 3) dijalankan?",
      numeric: { value: 4, tolerance: 0 },
      timeLimit: 30,
      points: 1000,
    }),
    q("algo", 2, {
      type: "single",
      topic: "Complexity",
      prompt: "Kompleksitas waktu binary search pada array terurut adalah…",
      options: ["O(n)", "O(log n)", "O(n log n)", "O(1)"],
      correct: 1,
      timeLimit: 20,
      points: 1000,
    }),
    q("algo", 3, {
      type: "ordering",
      topic: "Sorting",
      prompt: "Urutkan langkah bubble sort untuk satu pass dari awal hingga akhir.",
      options: [
        "Bandingkan dua elemen bersebelahan",
        "Tukar jika urutannya salah",
        "Geser ke pasangan berikutnya",
        "Elemen terbesar berada di posisi akhir",
      ],
      correct: [0, 1, 2, 3],
      timeLimit: 45,
      points: 1000,
    }),
  ],
};

export const NETWORK_QUIZ: Quiz = {
  id: "netw-osi",
  ownerId: DEMO_OWNER_ID,
  title: "OSI vs TCP/IP Showdown",
  description: "Layer mana yang bertanggung jawab? Soal cepat untuk review UTS.",
  course: { courseCode: "COMP6755", courseName: "Computer Networks", className: "LA02" },
  topic: "Network Layers",
  difficulty: "sedang",
  language: "id",
  visibility: "unlisted",
  mode: "classic",
  createdAt: "2026-09-02T03:00:00.000Z",
  updatedAt: "2026-09-18T03:00:00.000Z",
  questions: [
    q("net", 1, {
      type: "single",
      topic: "Transport Layer",
      prompt: "Protokol mana yang connection-oriented dan menjamin urutan paket?",
      options: ["UDP", "TCP", "ICMP", "ARP"],
      correct: 1,
      timeLimit: 20,
      points: 1000,
    }),
    q("net", 2, {
      type: "single",
      topic: "Network Layer",
      prompt: "Router bekerja terutama pada layer OSI ke berapa?",
      options: ["Layer 2", "Layer 3", "Layer 4", "Layer 7"],
      correct: 1,
      timeLimit: 20,
      points: 1000,
    }),
    q("net", 3, {
      type: "short_answer",
      topic: "Application Layer",
      prompt: "Protokol apa yang menerjemahkan nama domain menjadi alamat IP? (singkatan)",
      acceptedAnswers: ["DNS", "Domain Name System"],
      timeLimit: 30,
      points: 1000,
    }),
  ],
};

export const AI_QUIZ: Quiz = {
  id: "ai-search",
  ownerId: DEMO_OWNER_ID,
  title: "Search & Heuristics Arena",
  description: "BFS, DFS, A*, dan heuristik admissible.",
  course: { courseCode: "COMP6065", courseName: "Artificial Intelligence", className: "LD01" },
  topic: "Search Algorithms",
  difficulty: "sulit",
  language: "id",
  visibility: "private",
  mode: "classic",
  createdAt: "2026-09-05T03:00:00.000Z",
  updatedAt: "2026-09-21T03:00:00.000Z",
  questions: [
    q("ai", 1, {
      type: "single",
      topic: "Informed Search",
      prompt: "A* menjamin solusi optimal jika heuristiknya…",
      options: ["Selalu nol", "Admissible", "Lebih besar dari biaya sebenarnya", "Dipilih secara acak"],
      correct: 1,
      timeLimit: 20,
      points: 1000,
    }),
    q("ai", 2, {
      type: "poll",
      topic: "Refleksi",
      prompt: "Topik search mana yang paling ingin dibahas ulang minggu depan?",
      options: ["BFS vs DFS", "Uniform Cost Search", "A* dan heuristik", "Local search"],
      timeLimit: 20,
      points: 0,
    }),
  ],
};

export const SEED_QUIZZES: Quiz[] = [OS_BATTLE, CLOUD_QUIZ, ALGO_QUIZ, NETWORK_QUIZ, AI_QUIZ];

export function getSeedQuiz(id: string): Quiz | undefined {
  return SEED_QUIZZES.find((quiz) => quiz.id === id);
}
