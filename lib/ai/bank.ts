/**
 * Sample question bank for the mock generator: a few verified questions per common
 * Computer Science course at BINUS. Each text is a [Bahasa Indonesia, English] pair.
 * Answer options are listed with the correct one(s) marked by index; the generator
 * shuffles them deterministically.
 */

import type { Difficulty } from "@/lib/game/types";

export type Bilingual = readonly [id: string, en: string];

export interface BankItem {
  kind: "single" | "multiple" | "true_false" | "short_answer";
  level: Difficulty;
  subtopic: Bilingual;
  prompt: Bilingual;
  /** Choices (single / multiple). */
  options?: readonly Bilingual[];
  /** Index (single), indices (multiple), or 0 = true / 1 = false (true_false). */
  correct?: number | readonly number[];
  /** Accepted answers for short_answer (language-neutral technical terms). */
  accepted?: readonly string[];
  explanation: Bilingual;
}

export interface BankTopic {
  key: string;
  title: Bilingual;
  /** Lower-case keywords matched against the lecturer's topic and objective. */
  keywords: readonly string[];
  items: readonly BankItem[];
}

const same = (s: string): Bilingual => [s, s];

export const QUESTION_BANK: readonly BankTopic[] = [
  {
    key: "os",
    title: ["Sistem Operasi", "Operating Systems"],
    keywords: [
      "sistem operasi",
      "operating system",
      "os",
      "scheduling",
      "penjadwalan",
      "deadlock",
      "proses",
      "process",
      "thread",
      "paging",
      "memori",
      "memory",
      "semaphore",
      "mutex",
      "konkurensi",
      "concurrency",
      "cpu",
    ],
    items: [
      {
        kind: "single",
        level: "mudah",
        subtopic: same("Round Robin"),
        prompt: [
          "Algoritma penjadwalan mana yang memberi setiap proses jatah waktu (time quantum) secara bergiliran?",
          "Which scheduling algorithm gives every process a time quantum in turn?",
        ],
        options: [same("Round Robin"), same("FCFS"), same("SJF non-preemptive"), same("Priority (non-preemptive)")],
        correct: 0,
        explanation: [
          "Round Robin menjalankan proses bergiliran selama satu time quantum, lalu memindahkannya ke belakang ready queue.",
          "Round Robin runs each process for one time quantum, then moves it to the back of the ready queue.",
        ],
      },
      {
        kind: "single",
        level: "sedang",
        subtopic: same("Deadlock"),
        prompt: [
          "Manakah yang BUKAN salah satu dari empat kondisi Coffman penyebab deadlock?",
          "Which of these is NOT one of the four Coffman conditions for deadlock?",
        ],
        options: [["Preemption", "Preemption"], same("Mutual exclusion"), same("Hold and wait"), same("Circular wait")],
        correct: 0,
        explanation: [
          "Kondisinya adalah no preemption. Jika resource bisa direbut paksa, salah satu syarat deadlock patah.",
          "The condition is no preemption. If resources can be taken away, one deadlock condition is broken.",
        ],
      },
      {
        kind: "true_false",
        level: "mudah",
        subtopic: same("Thread"),
        prompt: [
          "Thread-thread dalam satu proses berbagi address space yang sama.",
          "Threads within the same process share one address space.",
        ],
        correct: 0,
        explanation: [
          "Thread berbagi kode, data, dan heap proses induknya, tetapi masing-masing punya stack dan register sendiri.",
          "Threads share the process's code, data and heap, but each has its own stack and registers.",
        ],
      },
      {
        kind: "multiple",
        level: "sedang",
        subtopic: same("Semaphore"),
        prompt: [
          "Pilih DUA pernyataan yang benar tentang semaphore.",
          "Choose the TWO true statements about semaphores.",
        ],
        options: [
          [
            "wait() pada semaphore bernilai 0 akan memblokir proses",
            "wait() on a semaphore whose value is 0 blocks the caller",
          ],
          ["Counting semaphore dapat bernilai lebih dari 1", "A counting semaphore can hold values greater than 1"],
          ["signal() selalu memblokir proses pemanggil", "signal() always blocks the caller"],
          ["Semaphore hanya dapat dipakai oleh satu thread", "A semaphore can only be used by one thread"],
        ],
        correct: [0, 1],
        explanation: [
          "wait() menunggu saat nilai 0; counting semaphore menghitung resource yang tersedia. signal() tidak pernah memblokir.",
          "wait() blocks when the value is 0; a counting semaphore counts available resources. signal() never blocks.",
        ],
      },
      {
        kind: "short_answer",
        level: "sulit",
        subtopic: same("Paging"),
        prompt: [
          "Apa nama cache perangkat keras yang menyimpan terjemahan alamat virtual ke fisik yang baru dipakai? (singkatan)",
          "What is the hardware cache that stores recent virtual-to-physical address translations called? (acronym)",
        ],
        accepted: ["TLB", "Translation Lookaside Buffer"],
        explanation: [
          "Translation Lookaside Buffer (TLB) mempercepat paging dengan menghindari akses page table di memori utama.",
          "The Translation Lookaside Buffer (TLB) speeds up paging by avoiding page-table lookups in main memory.",
        ],
      },
      {
        kind: "single",
        level: "sulit",
        subtopic: same("SJF"),
        prompt: [
          "P1, P2, P3 tiba bersamaan dengan burst time 6, 2, dan 4 ms. Berapa average waiting time dengan SJF non-preemptive?",
          "P1, P2, P3 arrive together with burst times 6, 2 and 4 ms. What is the average waiting time under non-preemptive SJF?",
        ],
        options: [
          ["2,67 ms", "2.67 ms"],
          ["4,00 ms", "4.00 ms"],
          ["3,33 ms", "3.33 ms"],
          ["4,67 ms", "4.67 ms"],
        ],
        correct: 0,
        explanation: [
          "Urutan P2 → P3 → P1; waiting time 0, 2, dan 6 ms. Rata-rata 8 / 3 ≈ 2,67 ms.",
          "Order P2 → P3 → P1; waiting times 0, 2 and 6 ms. Average 8 / 3 ≈ 2.67 ms.",
        ],
      },
    ],
  },
  {
    key: "db",
    title: ["Basis Data", "Databases"],
    keywords: [
      "basis data",
      "database",
      "sql",
      "normalisasi",
      "normalization",
      "query",
      "join",
      "acid",
      "transaksi",
      "transaction",
      "dbms",
      "erd",
      "relasi",
      "relational",
      "index",
    ],
    items: [
      {
        kind: "single",
        level: "mudah",
        subtopic: same("Primary key"),
        prompt: [
          "Apa fungsi utama primary key pada sebuah tabel?",
          "What is the main purpose of a primary key in a table?",
        ],
        options: [
          ["Mengidentifikasi setiap baris secara unik", "Uniquely identify every row"],
          ["Mempercepat semua query secara otomatis", "Automatically speed up every query"],
          ["Menghubungkan dua database berbeda", "Connect two different databases"],
          ["Menyimpan data yang boleh kosong", "Store values that may be empty"],
        ],
        correct: 0,
        explanation: [
          "Primary key harus unik dan tidak NULL sehingga setiap baris dapat dirujuk secara pasti.",
          "A primary key is unique and non-null so every row can be referenced unambiguously.",
        ],
      },
      {
        kind: "single",
        level: "sedang",
        subtopic: same("JOIN"),
        prompt: [
          "JOIN mana yang mengembalikan semua baris dari tabel kiri, termasuk yang tidak punya pasangan di tabel kanan?",
          "Which JOIN returns every row from the left table, including rows with no match on the right?",
        ],
        options: [same("LEFT JOIN"), same("INNER JOIN"), same("CROSS JOIN"), same("SELF JOIN")],
        correct: 0,
        explanation: [
          "LEFT (OUTER) JOIN mempertahankan semua baris kiri; kolom kanan diisi NULL jika tidak ada pasangan.",
          "LEFT (OUTER) JOIN keeps every left row; right-hand columns become NULL when there is no match.",
        ],
      },
      {
        kind: "true_false",
        level: "sedang",
        subtopic: same("Normalisasi"),
        prompt: ["Tabel yang sudah memenuhi 3NF pasti juga memenuhi 2NF.", "A table in 3NF is always in 2NF as well."],
        correct: 0,
        explanation: [
          "Bentuk normal bersifat bertingkat: 3NF mensyaratkan 2NF ditambah tidak ada dependensi transitif.",
          "Normal forms are cumulative: 3NF requires 2NF plus no transitive dependencies.",
        ],
      },
      {
        kind: "multiple",
        level: "sedang",
        subtopic: same("ACID"),
        prompt: [
          "Pilih DUA properti yang termasuk ACID pada transaksi basis data.",
          "Choose the TWO properties that are part of ACID transactions.",
        ],
        options: [same("Atomicity"), same("Isolation"), same("Availability"), same("Scalability")],
        correct: [0, 1],
        explanation: [
          "ACID = Atomicity, Consistency, Isolation, Durability. Availability adalah bagian dari teorema CAP.",
          "ACID = Atomicity, Consistency, Isolation, Durability. Availability belongs to the CAP theorem.",
        ],
      },
      {
        kind: "short_answer",
        level: "mudah",
        subtopic: same("SQL"),
        prompt: [
          "Klausa SQL apa yang dipakai untuk mengelompokkan baris sebelum fungsi agregat seperti COUNT()?",
          "Which SQL clause groups rows before aggregate functions such as COUNT()?",
        ],
        accepted: ["GROUP BY"],
        explanation: [
          "GROUP BY membentuk kelompok baris; HAVING dapat menyaring hasil agregatnya.",
          "GROUP BY forms row groups; HAVING can filter the aggregated result.",
        ],
      },
    ],
  },
  {
    key: "net",
    title: ["Jaringan Komputer", "Computer Networks"],
    keywords: [
      "jaringan",
      "network",
      "networking",
      "osi",
      "tcp",
      "udp",
      "ip",
      "subnet",
      "dns",
      "http",
      "routing",
      "router",
      "protokol",
      "protocol",
      "layer",
    ],
    items: [
      {
        kind: "single",
        level: "mudah",
        subtopic: same("Transport layer"),
        prompt: [
          "Protokol mana yang connection-oriented dan menjamin urutan paket?",
          "Which protocol is connection-oriented and guarantees packet order?",
        ],
        options: [same("TCP"), same("UDP"), same("ICMP"), same("ARP")],
        correct: 0,
        explanation: [
          "TCP membangun koneksi (three-way handshake), memberi nomor urut, dan melakukan retransmisi.",
          "TCP sets up a connection (three-way handshake), numbers segments and retransmits lost data.",
        ],
      },
      {
        kind: "single",
        level: "sedang",
        subtopic: same("Subnetting"),
        prompt: [
          "Berapa jumlah host yang dapat dipakai pada subnet /26?",
          "How many usable hosts does a /26 subnet provide?",
        ],
        options: [same("62"), same("64"), same("30"), same("126")],
        correct: 0,
        explanation: [
          "/26 menyisakan 6 bit host: 2⁶ = 64 alamat, dikurangi network dan broadcast = 62.",
          "/26 leaves 6 host bits: 2⁶ = 64 addresses, minus network and broadcast = 62.",
        ],
      },
      {
        kind: "true_false",
        level: "mudah",
        subtopic: same("Router"),
        prompt: [
          "Router bekerja terutama pada layer 3 (network) model OSI.",
          "Routers operate mainly at layer 3 (network) of the OSI model.",
        ],
        correct: 0,
        explanation: [
          "Router meneruskan paket berdasarkan alamat IP, yang berada di network layer.",
          "Routers forward packets based on IP addresses, which live in the network layer.",
        ],
      },
      {
        kind: "short_answer",
        level: "mudah",
        subtopic: same("DNS"),
        prompt: [
          "Layanan apa yang menerjemahkan nama domain menjadi alamat IP? (singkatan)",
          "Which service translates domain names into IP addresses? (acronym)",
        ],
        accepted: ["DNS", "Domain Name System"],
        explanation: [
          "Domain Name System (DNS) memetakan nama seperti binus.ac.id ke alamat IP.",
          "The Domain Name System (DNS) maps names such as binus.ac.id to IP addresses.",
        ],
      },
      {
        kind: "multiple",
        level: "sulit",
        subtopic: same("UDP"),
        prompt: [
          "Pilih DUA alasan aplikasi real-time (mis. VoIP) sering memakai UDP.",
          "Choose the TWO reasons real-time apps (e.g. VoIP) often use UDP.",
        ],
        options: [
          ["Overhead header lebih kecil", "Smaller header overhead"],
          ["Tidak menunggu retransmisi paket yang hilang", "No waiting for retransmission of lost packets"],
          ["Menjamin setiap paket sampai", "Guarantees every packet arrives"],
          ["Mengenkripsi data secara otomatis", "Encrypts data automatically"],
        ],
        correct: [0, 1],
        explanation: [
          "Untuk suara, paket yang terlambat sama buruknya dengan yang hilang; UDP ringan dan tidak menahan aliran data.",
          "For voice, a late packet is as bad as a lost one; UDP is light and never stalls the stream.",
        ],
      },
    ],
  },
  {
    key: "ds",
    title: ["Struktur Data", "Data Structures"],
    keywords: [
      "struktur data",
      "data structure",
      "stack",
      "queue",
      "antrian",
      "tumpukan",
      "tree",
      "pohon",
      "bst",
      "hash",
      "linked list",
      "graph",
      "graf",
      "heap",
    ],
    items: [
      {
        kind: "single",
        level: "mudah",
        subtopic: same("Stack"),
        prompt: [
          "Struktur data mana yang menerapkan prinsip LIFO (Last In, First Out)?",
          "Which data structure follows LIFO (Last In, First Out)?",
        ],
        options: [same("Stack"), same("Queue"), same("Linked list"), same("Hash table")],
        correct: 0,
        explanation: [
          "Pada stack, elemen yang terakhir di-push adalah yang pertama di-pop.",
          "In a stack, the last element pushed is the first one popped.",
        ],
      },
      {
        kind: "single",
        level: "sedang",
        subtopic: same("Binary search tree"),
        prompt: [
          "Traversal mana pada binary search tree yang menghasilkan data terurut naik?",
          "Which traversal of a binary search tree yields the keys in ascending order?",
        ],
        options: [same("In-order"), same("Pre-order"), same("Post-order"), same("Level-order")],
        correct: 0,
        explanation: [
          "In-order mengunjungi kiri → akar → kanan, sesuai sifat BST (kiri < akar < kanan).",
          "In-order visits left → root → right, matching the BST property (left < root < right).",
        ],
      },
      {
        kind: "true_false",
        level: "sedang",
        subtopic: same("Hash table"),
        prompt: [
          "Pencarian pada hash table selalu O(1), bahkan pada kasus terburuk.",
          "Lookup in a hash table is always O(1), even in the worst case.",
        ],
        correct: 1,
        explanation: [
          "Rata-ratanya O(1), tetapi collision berat dapat membuat kasus terburuk menjadi O(n).",
          "It is O(1) on average, but heavy collisions can make the worst case O(n).",
        ],
      },
      {
        kind: "short_answer",
        level: "mudah",
        subtopic: same("Queue"),
        prompt: ["Prinsip apa yang digunakan queue? (singkatan)", "Which principle does a queue follow? (acronym)"],
        accepted: ["FIFO", "First In First Out", "First In, First Out"],
        explanation: [
          "Queue melayani elemen sesuai urutan masuk: First In, First Out.",
          "A queue serves elements in arrival order: First In, First Out.",
        ],
      },
      {
        kind: "multiple",
        level: "sulit",
        subtopic: same("Linked list"),
        prompt: [
          "Pilih DUA kelebihan linked list dibanding array.",
          "Choose the TWO advantages of a linked list over an array.",
        ],
        options: [
          [
            "Sisip/hapus di tengah tanpa menggeser elemen lain",
            "Insert/delete in the middle without shifting elements",
          ],
          ["Ukuran dapat tumbuh dinamis", "Size can grow dynamically"],
          ["Akses acak berdasarkan indeks dalam O(1)", "Random access by index in O(1)"],
          ["Lebih ramah cache CPU", "Better CPU cache locality"],
        ],
        correct: [0, 1],
        explanation: [
          "Linked list unggul dalam penyisipan dan ukuran dinamis; array unggul dalam akses acak dan lokalitas cache.",
          "Linked lists win on insertion and dynamic size; arrays win on random access and cache locality.",
        ],
      },
    ],
  },
  {
    key: "algo",
    title: ["Algoritma dan Pemrograman", "Algorithms and Programming"],
    keywords: [
      "algoritma",
      "algorithm",
      "sorting",
      "pengurutan",
      "searching",
      "pencarian",
      "big-o",
      "big o",
      "kompleksitas",
      "complexity",
      "rekursi",
      "recursion",
      "looping",
      "perulangan",
      "dynamic programming",
      "binary search",
    ],
    items: [
      {
        kind: "single",
        level: "mudah",
        subtopic: same("Binary search"),
        prompt: [
          "Kompleksitas waktu binary search pada array terurut adalah…",
          "The time complexity of binary search on a sorted array is…",
        ],
        options: [same("O(log n)"), same("O(n)"), same("O(n log n)"), same("O(1)")],
        correct: 0,
        explanation: [
          "Setiap langkah membuang separuh ruang pencarian, sehingga jumlah langkah ≈ log₂ n.",
          "Each step halves the search space, so the number of steps is about log₂ n.",
        ],
      },
      {
        kind: "single",
        level: "sedang",
        subtopic: same("Sorting"),
        prompt: [
          "Algoritma sorting mana yang kompleksitas kasus terburuknya O(n log n)?",
          "Which sorting algorithm has an O(n log n) worst case?",
        ],
        options: [same("Merge sort"), same("Quick sort"), same("Bubble sort"), same("Insertion sort")],
        correct: 0,
        explanation: [
          "Merge sort selalu membagi dua dan menggabungkan dalam O(n) per level. Quick sort bisa O(n²) pada pivot buruk.",
          "Merge sort always splits in half and merges in O(n) per level. Quick sort degrades to O(n²) with bad pivots.",
        ],
      },
      {
        kind: "true_false",
        level: "mudah",
        subtopic: same("Rekursi"),
        prompt: [
          "Setiap fungsi rekursif membutuhkan base case agar dapat berhenti.",
          "Every recursive function needs a base case in order to stop.",
        ],
        correct: 0,
        explanation: [
          "Tanpa base case, rekursi terus memanggil dirinya hingga stack overflow.",
          "Without a base case, recursion keeps calling itself until the stack overflows.",
        ],
      },
      {
        kind: "short_answer",
        level: "sedang",
        subtopic: same("Big-O"),
        prompt: [
          "Dua perulangan bersarang yang masing-masing berjalan n kali memiliki kompleksitas…",
          "Two nested loops that each run n times have a complexity of…",
        ],
        accepted: ["O(n^2)", "O(n²)", "n^2", "n²", "O(n2)"],
        explanation: [
          "Perulangan dalam berjalan n kali untuk setiap iterasi luar: n × n = n².",
          "The inner loop runs n times for each outer iteration: n × n = n².",
        ],
      },
      {
        kind: "multiple",
        level: "sulit",
        subtopic: same("Dynamic programming"),
        prompt: [
          "Pilih DUA ciri masalah yang cocok diselesaikan dengan dynamic programming.",
          "Choose the TWO traits of problems suited to dynamic programming.",
        ],
        options: [
          same("Overlapping subproblems"),
          same("Optimal substructure"),
          ["Input selalu terurut", "Input is always sorted"],
          ["Tidak ada rekursi", "No recursion involved"],
        ],
        correct: [0, 1],
        explanation: [
          "DP menyimpan hasil subproblem yang berulang dan membangun solusi optimal dari solusi subproblem.",
          "DP stores repeated subproblem results and builds the optimum from optimal sub-solutions.",
        ],
      },
    ],
  },
  {
    key: "oop",
    title: ["Pemrograman Berorientasi Objek", "Object-Oriented Programming"],
    keywords: [
      "oop",
      "pbo",
      "object oriented",
      "berorientasi objek",
      "objek",
      "object",
      "class",
      "kelas",
      "inheritance",
      "pewarisan",
      "polymorphism",
      "polimorfisme",
      "encapsulation",
      "enkapsulasi",
      "abstraction",
      "abstraksi",
      "interface",
      "java",
    ],
    items: [
      {
        kind: "single",
        level: "mudah",
        subtopic: same("Encapsulation"),
        prompt: [
          "Menyembunyikan atribut dengan private dan menyediakan getter/setter adalah contoh…",
          "Hiding attributes as private and exposing getters/setters is an example of…",
        ],
        options: [same("Encapsulation"), same("Inheritance"), same("Polymorphism"), same("Overloading")],
        correct: 0,
        explanation: [
          "Enkapsulasi melindungi state internal objek dan hanya membuka akses melalui method.",
          "Encapsulation protects an object's internal state and only exposes access through methods.",
        ],
      },
      {
        kind: "single",
        level: "sedang",
        subtopic: same("Polymorphism"),
        prompt: [
          "Subclass mendefinisikan ulang method milik superclass dengan signature yang sama. Ini disebut…",
          "A subclass redefines a superclass method with the same signature. This is called…",
        ],
        options: [same("Overriding"), same("Overloading"), same("Encapsulation"), same("Composition")],
        correct: 0,
        explanation: [
          "Overriding memungkinkan dynamic dispatch: method yang dipanggil ditentukan oleh tipe objek saat runtime.",
          "Overriding enables dynamic dispatch: the method called depends on the object's runtime type.",
        ],
      },
      {
        kind: "true_false",
        level: "sedang",
        subtopic: same("Abstract class"),
        prompt: [
          "Abstract class dapat langsung dibuat objeknya dengan new.",
          "An abstract class can be instantiated directly with new.",
        ],
        correct: 1,
        explanation: [
          "Abstract class hanya dapat diturunkan; objek dibuat dari subclass konkretnya.",
          "An abstract class can only be extended; objects are created from its concrete subclasses.",
        ],
      },
      {
        kind: "multiple",
        level: "mudah",
        subtopic: same("Pilar OOP"),
        prompt: ["Pilih DUA yang termasuk pilar OOP.", "Choose the TWO that are pillars of OOP."],
        options: [same("Inheritance"), same("Abstraction"), same("Compilation"), same("Normalization")],
        correct: [0, 1],
        explanation: [
          "Empat pilar OOP: encapsulation, inheritance, polymorphism, dan abstraction.",
          "The four pillars of OOP: encapsulation, inheritance, polymorphism and abstraction.",
        ],
      },
      {
        kind: "short_answer",
        level: "sulit",
        subtopic: same("Constructor"),
        prompt: [
          "Method khusus yang otomatis dipanggil saat objek dibuat disebut…",
          "The special method called automatically when an object is created is the…",
        ],
        accepted: ["constructor", "konstruktor"],
        explanation: [
          "Constructor menginisialisasi state awal objek dan tidak memiliki tipe kembalian.",
          "A constructor initialises the object's initial state and has no return type.",
        ],
      },
    ],
  },
  {
    key: "se",
    title: ["Rekayasa Perangkat Lunak", "Software Engineering"],
    keywords: [
      "rekayasa perangkat lunak",
      "software engineering",
      "agile",
      "scrum",
      "sprint",
      "testing",
      "pengujian",
      "git",
      "sdlc",
      "requirement",
      "kebutuhan",
      "uml",
      "waterfall",
      "kanban",
    ],
    items: [
      {
        kind: "single",
        level: "mudah",
        subtopic: same("Scrum"),
        prompt: [
          "Dalam Scrum, siapa yang bertanggung jawab memprioritaskan product backlog?",
          "In Scrum, who is responsible for prioritising the product backlog?",
        ],
        options: [
          same("Product Owner"),
          same("Scrum Master"),
          ["Tim pengembang", "The developers"],
          ["Manajer proyek", "The project manager"],
        ],
        correct: 0,
        explanation: [
          "Product Owner memaksimalkan nilai produk dengan mengelola dan mengurutkan product backlog.",
          "The Product Owner maximises product value by managing and ordering the product backlog.",
        ],
      },
      {
        kind: "true_false",
        level: "mudah",
        subtopic: same("Waterfall"),
        prompt: [
          "Model waterfall menyelesaikan setiap fase secara berurutan sebelum masuk ke fase berikutnya.",
          "The waterfall model completes each phase in sequence before starting the next.",
        ],
        correct: 0,
        explanation: [
          "Waterfall bersifat linear: requirement → desain → implementasi → pengujian → pemeliharaan.",
          "Waterfall is linear: requirements → design → implementation → testing → maintenance.",
        ],
      },
      {
        kind: "single",
        level: "sedang",
        subtopic: same("Testing"),
        prompt: [
          "Pengujian yang memeriksa satu fungsi atau method secara terisolasi disebut…",
          "Testing a single function or method in isolation is called…",
        ],
        options: [
          same("Unit testing"),
          same("Integration testing"),
          same("System testing"),
          same("Acceptance testing"),
        ],
        correct: 0,
        explanation: [
          "Unit test menguji bagian terkecil kode; dependensi biasanya diganti mock atau stub.",
          "Unit tests exercise the smallest pieces of code; dependencies are usually mocked or stubbed.",
        ],
      },
      {
        kind: "short_answer",
        level: "sedang",
        subtopic: same("Git"),
        prompt: [
          "Perintah git apa yang menggabungkan branch lain ke branch aktif?",
          "Which git command combines another branch into the current branch?",
        ],
        accepted: ["git merge", "merge"],
        explanation: [
          "git merge membuat merge commit (atau fast-forward) yang menggabungkan riwayat kedua branch.",
          "git merge creates a merge commit (or fast-forwards) that joins both histories.",
        ],
      },
      {
        kind: "multiple",
        level: "sulit",
        subtopic: same("Requirement"),
        prompt: [
          "Pilih DUA contoh non-functional requirement.",
          "Choose the TWO examples of non-functional requirements.",
        ],
        options: [
          ["Halaman memuat dalam kurang dari 2 detik", "Pages load in under 2 seconds"],
          ["Sistem tersedia 99,9% waktu", "The system is available 99.9% of the time"],
          ["Mahasiswa dapat mengunggah tugas", "Students can upload assignments"],
          ["Dosen dapat membuat kuis", "Lecturers can create quizzes"],
        ],
        correct: [0, 1],
        explanation: [
          "Non-functional requirement menjelaskan kualitas (kinerja, ketersediaan), bukan fitur yang dilakukan sistem.",
          "Non-functional requirements describe qualities (performance, availability), not features.",
        ],
      },
    ],
  },
  {
    key: "sec",
    title: ["Keamanan Informasi", "Information Security"],
    keywords: [
      "keamanan",
      "security",
      "kriptografi",
      "cryptography",
      "enkripsi",
      "encryption",
      "hash",
      "hashing",
      "xss",
      "sql injection",
      "injection",
      "autentikasi",
      "authentication",
      "password",
      "cyber",
      "siber",
    ],
    items: [
      {
        kind: "single",
        level: "mudah",
        subtopic: same("Hashing"),
        prompt: [
          "Cara paling tepat menyimpan password pengguna di basis data adalah…",
          "The right way to store user passwords in a database is…",
        ],
        options: [
          [
            "Hash dengan salt memakai algoritma lambat seperti bcrypt/Argon2",
            "Salted hash with a slow algorithm such as bcrypt/Argon2",
          ],
          ["Enkripsi simetris dengan satu kunci server", "Symmetric encryption with one server key"],
          ["Teks biasa di kolom tersembunyi", "Plain text in a hidden column"],
          ["Base64", "Base64"],
        ],
        correct: 0,
        explanation: [
          "Hash satu arah dengan salt dan biaya komputasi tinggi mempersulit brute force jika data bocor.",
          "A one-way salted hash with a high work factor makes brute force hard if data leaks.",
        ],
      },
      {
        kind: "true_false",
        level: "mudah",
        subtopic: same("Enkripsi asimetris"),
        prompt: [
          "Pada enkripsi asimetris, data yang dienkripsi dengan public key didekripsi dengan private key pasangannya.",
          "In asymmetric encryption, data encrypted with a public key is decrypted with the matching private key.",
        ],
        correct: 0,
        explanation: [
          "Public key boleh dibagikan; hanya pemilik private key yang dapat membuka pesannya.",
          "The public key may be shared; only the private-key owner can read the message.",
        ],
      },
      {
        kind: "single",
        level: "sedang",
        subtopic: same("SQL injection"),
        prompt: ["Pertahanan utama terhadap SQL injection adalah…", "The primary defence against SQL injection is…"],
        options: [
          ["Parameterized query / prepared statement", "Parameterised queries / prepared statements"],
          ["Menyembunyikan pesan error", "Hiding error messages"],
          ["Memakai HTTPS", "Using HTTPS"],
          ["Membatasi panjang URL", "Limiting URL length"],
        ],
        correct: 0,
        explanation: [
          "Parameter dikirim terpisah dari perintah SQL, sehingga input tidak pernah dieksekusi sebagai kode.",
          "Parameters travel separately from the SQL command, so input is never executed as code.",
        ],
      },
      {
        kind: "short_answer",
        level: "sedang",
        subtopic: same("XSS"),
        prompt: [
          "Serangan yang menyisipkan script berbahaya ke halaman web yang dilihat pengguna lain disebut… (singkatan)",
          "An attack that injects malicious scripts into pages viewed by other users is called… (acronym)",
        ],
        accepted: ["XSS", "Cross-site scripting", "Cross site scripting"],
        explanation: [
          "Cross-site scripting dicegah dengan output encoding dan Content Security Policy.",
          "Cross-site scripting is prevented with output encoding and a Content Security Policy.",
        ],
      },
      {
        kind: "multiple",
        level: "sulit",
        subtopic: same("CIA triad"),
        prompt: ["Pilih DUA unsur CIA triad.", "Choose the TWO elements of the CIA triad."],
        options: [same("Confidentiality"), same("Integrity"), same("Compliance"), same("Identity")],
        correct: [0, 1],
        explanation: [
          "CIA triad: Confidentiality, Integrity, Availability.",
          "CIA triad: Confidentiality, Integrity, Availability.",
        ],
      },
    ],
  },
  {
    key: "web",
    title: ["Pemrograman Web", "Web Programming"],
    keywords: [
      "web",
      "html",
      "css",
      "javascript",
      "js",
      "http",
      "rest",
      "api",
      "frontend",
      "backend",
      "react",
      "next.js",
      "browser",
    ],
    items: [
      {
        kind: "single",
        level: "mudah",
        subtopic: same("HTTP"),
        prompt: [
          "Status code HTTP yang menandakan resource tidak ditemukan adalah…",
          "The HTTP status code for a resource that was not found is…",
        ],
        options: [same("404"), same("200"), same("301"), same("500")],
        correct: 0,
        explanation: [
          "4xx menandakan kesalahan di sisi klien; 404 berarti resource tidak ada di server.",
          "4xx means a client-side error; 404 means the resource does not exist on the server.",
        ],
      },
      {
        kind: "single",
        level: "sedang",
        subtopic: same("REST"),
        prompt: [
          "Method HTTP mana yang idempoten dan biasa dipakai untuk mengganti seluruh resource?",
          "Which idempotent HTTP method is typically used to replace a whole resource?",
        ],
        options: [same("PUT"), same("POST"), same("PATCH"), same("CONNECT")],
        correct: 0,
        explanation: [
          "PUT yang diulang menghasilkan state yang sama; POST biasanya membuat resource baru setiap kali.",
          "Repeating a PUT yields the same state; POST usually creates a new resource each time.",
        ],
      },
      {
        kind: "true_false",
        level: "mudah",
        subtopic: same("CSS"),
        prompt: [
          "Pada box-sizing: border-box, padding dan border sudah termasuk dalam width elemen.",
          "With box-sizing: border-box, padding and border are included in the element's width.",
        ],
        correct: 0,
        explanation: [
          "border-box membuat width mencakup content, padding, dan border sehingga layout lebih mudah diprediksi.",
          "border-box makes width include content, padding and border, so layouts are easier to predict.",
        ],
      },
      {
        kind: "short_answer",
        level: "sedang",
        subtopic: same("DOM"),
        prompt: [
          "Representasi pohon objek dari dokumen HTML yang dapat diubah JavaScript disebut… (singkatan)",
          "The object tree of an HTML document that JavaScript can change is called the… (acronym)",
        ],
        accepted: ["DOM", "Document Object Model"],
        explanation: [
          "Document Object Model memungkinkan script membaca dan mengubah struktur halaman.",
          "The Document Object Model lets scripts read and change the page structure.",
        ],
      },
    ],
  },
];
