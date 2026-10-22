"""
seed_study_plans.py
===================
Seeds the three GATE CSE PYQ study plan templates (3, 6, and 12 months)
into the study_plan_templates table.

Run once after setting up a fresh database:
    python scripts/seed_study_plans.py

Requirements:
    pip install asyncpg python-dotenv

The script reads DATABASE_URL from .env (or you can set it directly below).
It uses ON CONFLICT DO NOTHING so it is safe to run multiple times.
"""

import asyncio
import os
import json
import uuid
from datetime import datetime
from pathlib import Path

try:
    import asyncpg
except ImportError:
    raise SystemExit("asyncpg not installed. Run: pip install asyncpg")

# ── Config ────────────────────────────────────────────────────────────────────
# Reads DATABASE_URL from .env if available, otherwise falls back to the default.
def _get_db_url() -> str:
    # Prefer DATABASE_URL provided by Docker env (set via .env.docker)
    env_url = os.getenv("DATABASE_URL")
    if env_url:
        return env_url.replace("postgresql+asyncpg://", "postgresql://")

    # Local development fallback
    env_file = Path(__file__).parent.parent / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("DATABASE_URL="):
                raw = line.split("=", 1)[1].strip()
                return raw.replace("postgresql+asyncpg://", "postgresql://")

    return "postgresql://postgres:postgres@localhost:5432/assessment_db"


# ── Plan data ─────────────────────────────────────────────────────────────────
PLAN_3M = {
  "duration_weeks": 12,
  "roadmap": [
    {"week": 1, "focus_type": "Core Learning", "subjects": [
      {"subject": "Programming and Data Structures", "priority": "CRITICAL", "topic": "C Programming", "subtopics": ["Pointers and Arrays"]},
      {"subject": "Data Structures", "priority": "CRITICAL", "topic": "Basic Data Structures", "subtopics": ["Linked List", "Arrays"]}
    ]},
    {"week": 2, "focus_type": "Core Learning", "subjects": [
      {"subject": "Data Structures", "priority": "CRITICAL", "topic": "Trees & Heaps", "subtopics": ["Trees / Binary Tree Traversal", "Heaps / Min-Heap"]},
      {"subject": "Algorithms", "priority": "CRITICAL", "topic": "Analysis", "subtopics": ["Asymptotic Notation"]}
    ]},
    {"week": 3, "focus_type": "Core Learning", "subjects": [
      {"subject": "Algorithms", "priority": "CRITICAL", "topic": "Graph Algorithms", "subtopics": ["DFS and BFS Trees"]},
      {"subject": "Algorithms", "priority": "CRITICAL", "topic": "Analysis", "subtopics": ["Recurrence Relations"]},
      {"subject": "Algorithms", "priority": "CRITICAL", "topic": "Sorting", "subtopics": ["Quicksort"]}
    ]},
    {"week": 4, "focus_type": "Core Learning", "subjects": [
      {"subject": "Operating System", "priority": "CRITICAL", "topic": "Process Management", "subtopics": ["Process States", "CPU Scheduling"]},
      {"subject": "Operating System", "priority": "CRITICAL", "topic": "Deadlocks", "subtopics": ["Deadlock / Banker's Algorithm"]}
    ]},
    {"week": 5, "focus_type": "Core Learning", "subjects": [
      {"subject": "Databases", "priority": "CRITICAL", "topic": "ER Model", "subtopics": ["ER Model"]},
      {"subject": "Databases", "priority": "CRITICAL", "topic": "Relational Model", "subtopics": ["Relational Model Concepts"]},
      {"subject": "Databases", "priority": "CRITICAL", "topic": "Normalization", "subtopics": ["Functional Dependencies"]}
    ]},
    {"week": 6, "focus_type": "Core Learning", "subjects": [
      {"subject": "Theory of Computation", "priority": "HIGH", "topic": "Finite Automata", "subtopics": ["DFA", "NFA to DFA Conversion"]},
      {"subject": "Theory of Computation", "priority": "HIGH", "topic": "Regular Languages", "subtopics": ["Regular Expressions"]}
    ]},
    {"week": 7, "focus_type": "Core Learning", "subjects": [
      {"subject": "Computer Organization and Architecture", "priority": "HIGH", "topic": "Data Representation", "subtopics": ["Floating Point", "IEEE 754 Standard"]},
      {"subject": "Computer Organization and Architecture", "priority": "HIGH", "topic": "Cache Memory", "subtopics": ["Direct Mapped Cache, Cache Hits/Misses"]}
    ]},
    {"week": 8, "focus_type": "Core Learning", "subjects": [
      {"subject": "Computer Networks", "priority": "HIGH", "topic": "IP Addressing", "subtopics": ["IP Addressing", "Subnetting"]},
      {"subject": "Computer Networks", "priority": "HIGH", "topic": "Routing", "subtopics": ["Distance Vector Routing"]}
    ]},
    {"week": 9, "focus_type": "Core Learning", "subjects": [
      {"subject": "Discrete Mathematics", "priority": "HIGH", "topic": "Set Theory & Relations", "subtopics": ["Set theory", "Functions and Relations"]},
      {"subject": "Digital Logic", "priority": "MEDIUM", "topic": "Boolean Algebra", "subtopics": ["Boolean Functions / Prime Implicants / K-Map"]}
    ]},
    {"week": 10, "focus_type": "Core Learning", "subjects": [
      {"subject": "Compiler Design", "priority": "MEDIUM", "topic": "Lexical Analysis", "subtopics": ["Lexical Analysis / Regular Expressions / Longest Match"]},
      {"subject": "Compiler Design", "priority": "MEDIUM", "topic": "Parsing", "subtopics": ["LR Parsers"]},
      {"subject": "Engineering Mathematics", "priority": "MEDIUM", "topic": "Linear Algebra", "subtopics": ["Matrices and Determinants"]}
    ]},
    {"week": 11, "focus_type": "Core Learning", "subjects": [
      {"subject": "Operating System", "priority": "CRITICAL", "topic": "Memory Management", "subtopics": ["Paging / Page Replacement Algorithms (LRU)", "Virtual Memory, Paging, TLB"]},
      {"subject": "Databases", "priority": "CRITICAL", "topic": "Transactions and Concurrency Control", "subtopics": ["Transactions and Concurrency Control"]}
    ]},
    {"week": 12, "focus_type": "Revision & Advanced Application", "subjects": [
      {"subject": "Algorithms", "priority": "CRITICAL", "topic": "Dynamic Programming", "subtopics": ["Dynamic Programming / Matrix Chain Multiplication"]},
      {"subject": "Theory of Computation", "priority": "HIGH", "topic": "Computability", "subtopics": ["Decidability / Undecidability"]},
      {"subject": "Computer Networks", "priority": "HIGH", "topic": "Application Layer Protocols", "subtopics": ["HTTP and DNS"]}
    ]}
  ]
}

PLAN_6M = {
  "duration_weeks": 24,
  "roadmap": [
    {"week": 1, "focus_type": "Core Learning", "subjects": [
      {"subject": "Programming and Data Structures", "priority": "CRITICAL", "topic": "C Programming", "subtopics": ["C Programming Basics", "Function calls, variable scope", "Loops and Control Flow"]},
      {"subject": "Data Structures", "priority": "CRITICAL", "topic": "Basic Data Structures", "subtopics": ["Arrays", "Linked List"]},
      {"subject": "Algorithms", "priority": "CRITICAL", "topic": "Analysis", "subtopics": ["Asymptotic Notation", "Complexity Analysis"]}
    ]},
    {"week": 2, "focus_type": "Core Learning", "subjects": [
      {"subject": "Programming and Data Structures", "priority": "CRITICAL", "topic": "C Programming", "subtopics": ["Pointers and Arrays", "C Programming / Pointers / Call by Value vs Reference"]},
      {"subject": "Data Structures", "priority": "CRITICAL", "topic": "Basic Data Structures", "subtopics": ["Stack & Queue", "Stacks and Queues"]},
      {"subject": "Algorithms", "priority": "CRITICAL", "topic": "Analysis", "subtopics": ["Recurrence Relations", "Analysis of Recurrence Relations"]}
    ]},
    {"week": 3, "focus_type": "Core Learning", "subjects": [
      {"subject": "Programming and Data Structures", "priority": "CRITICAL", "topic": "C Programming", "subtopics": ["Recursion", "C Programming / Recursion / Pseudo-code"]},
      {"subject": "Data Structures", "priority": "CRITICAL", "topic": "Trees", "subtopics": ["Trees / Binary Tree Traversal"]},
      {"subject": "Algorithms", "priority": "CRITICAL", "topic": "Sorting and Searching", "subtopics": ["Sorting", "Quicksort, Probability", "Selection Algorithms"]}
    ]},
    {"week": 4, "focus_type": "Core Learning", "subjects": [
      {"subject": "Operating System", "priority": "CRITICAL", "topic": "Process Management", "subtopics": ["Process States", "CPU Scheduling", "Round Robin Scheduling"]},
      {"subject": "Digital Logic", "priority": "MEDIUM", "topic": "Number Representation", "subtopics": ["Number System Conversion", "Radix Conversion", "2's Complement", "Two's complement, overflow"]},
      {"subject": "Discrete Mathematics", "priority": "HIGH", "topic": "Logic", "subtopics": ["Propositional Logic", "Predicate Logic"]}
    ]},
    {"week": 5, "focus_type": "Core Learning", "subjects": [
      {"subject": "Operating System", "priority": "CRITICAL", "topic": "Concurrency and Synchronization", "subtopics": ["Concurrency", "Concurrency and Synchronization", "Process Synchronization / Semaphores / Producer-Consumer"]},
      {"subject": "Computer Organization and Architecture", "priority": "HIGH", "topic": "Data Representation", "subtopics": ["Fixed Point Representation", "Floating Point", "IEEE 754 Standard", "Signed Numbers"]},
      {"subject": "Digital Logic", "priority": "MEDIUM", "topic": "Boolean Algebra", "subtopics": ["Boolean Algebra / XOR XNOR", "Identities", "Boolean Operations/Algebraic Properties"]}
    ]},
    {"week": 6, "focus_type": "Core Learning", "subjects": [
      {"subject": "Operating System", "priority": "CRITICAL", "topic": "Deadlocks", "subtopics": ["Deadlock / Banker's Algorithm", "Deadlock / Resource Allocation", "Deadlock detection and prevention", "Deadlocks"]},
      {"subject": "Computer Organization and Architecture", "priority": "HIGH", "topic": "Cache Memory", "subtopics": ["Cache Memory", "Direct Mapped Cache, Cache Hits/Misses", "Fully Associative Cache", "Cache Memory / Set-Associative Cache / Tag Field"]},
      {"subject": "Digital Logic", "priority": "MEDIUM", "topic": "Combinational Circuits", "subtopics": ["Boolean Functions / Prime Implicants / K-Map", "Logic Gate Implementation", "Multiplexers"]}
    ]},
    {"week": 7, "focus_type": "Core Learning", "subjects": [
      {"subject": "Databases", "priority": "CRITICAL", "topic": "ER Model & Relational Model", "subtopics": ["ER Model", "ER Model / Relationships", "Weak Entity Sets", "Relational Model", "Relational Model Concepts"]},
      {"subject": "Theory of Computation", "priority": "HIGH", "topic": "Finite Automata", "subtopics": ["Finite Automata", "DFA", "NFA to DFA Conversion"]},
      {"subject": "Computer Organization and Architecture", "priority": "HIGH", "topic": "Cache Memory", "subtopics": ["Cache Mapping", "Cache Policies", "Average Memory Access Time (AMAT)"]}
    ]},
    {"week": 8, "focus_type": "Core Learning", "subjects": [
      {"subject": "Databases", "priority": "CRITICAL", "topic": "Relational Algebra & SQL", "subtopics": ["Relational Algebra / Joins / Outer Join", "Relational Algebra Operators, Division"]},
      {"subject": "Theory of Computation", "priority": "HIGH", "topic": "Regular Languages", "subtopics": ["Regular Expressions", "Regular Languages", "Properties of Regular Languages", "Pumping Lemma"]},
      {"subject": "Programming and Data Structures", "priority": "CRITICAL", "topic": "C Programming", "subtopics": ["Recursion"]}
    ]},
    {"week": 9, "focus_type": "Core Learning", "subjects": [
      {"subject": "Databases", "priority": "CRITICAL", "topic": "Relational Algebra & SQL", "subtopics": ["SQL / Joins"]},
      {"subject": "Computer Networks", "priority": "HIGH", "topic": "Network Layering", "subtopics": ["Concept of Layering and LAN Technologies", "LAN Technologies"]},
      {"subject": "Operating System", "priority": "CRITICAL", "topic": "Memory Management", "subtopics": ["Memory Allocation", "Memory Management / Demand Paging / Page Fault"]}
    ]},
    {"week": 10, "focus_type": "Core Learning", "subjects": [
      {"subject": "Databases", "priority": "CRITICAL", "topic": "Functional Dependencies", "subtopics": ["Functional Dependencies", "Functional Dependencies, Keys"]},
      {"subject": "Computer Networks", "priority": "HIGH", "topic": "Data Link Layer", "subtopics": ["Flow and Error Control", "MAC Protocols / Carrier Sense / Collision Avoidance", "Address Resolution Protocol (ARP)"]},
      {"subject": "Operating System", "priority": "CRITICAL", "topic": "Memory Management & Virtual Memory", "subtopics": ["Virtual Memory, Paging, TLB", "Paging", "Paging / Page Replacement Algorithms (LRU)"]}
    ]},
    {"week": 11, "focus_type": "Core Learning", "subjects": [
      {"subject": "Databases", "priority": "CRITICAL", "topic": "Normalization", "subtopics": ["Normalization", "Normalization / 3NF / BCNF", "BCNF, Dependency Preservation, Lossless Decomposition"]},
      {"subject": "Computer Networks", "priority": "HIGH", "topic": "Network Layer", "subtopics": ["IP Addressing", "Subnetting", "IP Fragmentation", "IP Fragmentation / Fragmentation Offset"]},
      {"subject": "Algorithms", "priority": "CRITICAL", "topic": "Graph Algorithms", "subtopics": ["Graph Algorithms / DFS / BFS", "DFS and BFS Trees"]}
    ]},
    {"week": 12, "focus_type": "Core Learning", "subjects": [
      {"subject": "Databases", "priority": "CRITICAL", "topic": "Indexing", "subtopics": ["Indexing", "B+ Trees", "Indexing (B+ Tree)"]},
      {"subject": "Computer Networks", "priority": "HIGH", "topic": "Network Layer", "subtopics": ["Network Layer", "Network Headers / Protocol Fields", "Routing", "Distance Vector Routing"]},
      {"subject": "Algorithms", "priority": "CRITICAL", "topic": "Graph Theory", "subtopics": ["Minimum Spanning Tree"]}
    ]},
    {"week": 13, "focus_type": "Core Learning", "subjects": [
      {"subject": "Databases", "priority": "CRITICAL", "topic": "Transactions and Concurrency Control", "subtopics": ["Transactions and Concurrency Control", "ACID Properties", "Conflict Equivalence / Serializability"]},
      {"subject": "Computer Networks", "priority": "HIGH", "topic": "Transport Layer", "subtopics": ["TCP", "TCP Handshake", "TCP Congestion Control", "TCP Congestion Control / Slow Start"]},
      {"subject": "Algorithms", "priority": "CRITICAL", "topic": "Graph Algorithms", "subtopics": ["Shortest Path"]}
    ]},
    {"week": 14, "focus_type": "Core Learning", "subjects": [
      {"subject": "Compiler Design", "priority": "MEDIUM", "topic": "Lexical Analysis", "subtopics": ["Compiler Phases / Basics", "Phases of Compiler", "Front-end and Back-end", "Lexical Analysis", "Lexical Analysis / Regular Expressions / Longest Match"]},
      {"subject": "Engineering Mathematics", "priority": "MEDIUM", "topic": "Linear Algebra", "subtopics": ["Matrices", "Matrices and Determinants", "Determinants", "Matrix Properties"]},
      {"subject": "Computer Networks", "priority": "HIGH", "topic": "Transport & Application Layer", "subtopics": ["TCP / Sequence Number Wraparound", "HTTP and DNS", "Email Protocols"]}
    ]},
    {"week": 15, "focus_type": "Core Learning", "subjects": [
      {"subject": "Compiler Design", "priority": "MEDIUM", "topic": "Parsing", "subtopics": ["Parser Types", "LR Parsers", "LR Parsing"]},
      {"subject": "Engineering Mathematics", "priority": "MEDIUM", "topic": "Linear Algebra", "subtopics": ["Eigenvalues", "Eigenvalues and Eigenvectors", "Linear Algebra / Eigenvalues", "Linear Algebra / Eigenvalues / Diagonalization"]},
      {"subject": "Algorithms", "priority": "CRITICAL", "topic": "Dynamic Programming", "subtopics": ["Dynamic Programming / Matrix Chain Multiplication"]}
    ]},
    {"week": 16, "focus_type": "Core Learning", "subjects": [
      {"subject": "Theory of Computation", "priority": "HIGH", "topic": "Context-Free Languages", "subtopics": ["Context-Free Grammars", "Context-Free Languages", "Properties of Context-Free Languages"]},
      {"subject": "Engineering Mathematics", "priority": "MEDIUM", "topic": "Probability", "subtopics": ["Events and Probability", "Probability", "Conditional Probability", "Probability / Bayes' Theorem"]},
      {"subject": "Algorithms", "priority": "CRITICAL", "topic": "Greedy Algorithms", "subtopics": ["Greedy Algorithms / Knapsack"]}
    ]},
    {"week": 17, "focus_type": "Core Learning", "subjects": [
      {"subject": "Computer Organization and Architecture", "priority": "HIGH", "topic": "Pipelining", "subtopics": ["Pipelining", "Instruction Pipelining", "Instruction Pipeline / Clock Cycles", "Control Hazards, Branch Prediction, Speedup"]},
      {"subject": "Discrete Mathematics", "priority": "HIGH", "topic": "Combinatorics", "subtopics": ["Combinatorics", "Permutations and Combinations", "Generating Functions", "Generating Functions / Sequences"]},
      {"subject": "General Aptitude", "priority": "LOW", "topic": "Numerical Ability", "subtopics": ["Algebra / Exponents", "Geometry / Area", "Number Theory / LCM"]}
    ]},
    {"week": 18, "focus_type": "Core Learning", "subjects": [
      {"subject": "Theory of Computation", "priority": "HIGH", "topic": "Computability", "subtopics": ["Language Hierarchy", "Decidability / Undecidability", "Recursively Enumerable Languages", "First-Order Logic / Models"]},
      {"subject": "Discrete Mathematics", "priority": "HIGH", "topic": "Graph Theory", "subtopics": ["Graph Theory", "Graph Theory / Degree / Connected Components", "Spanning Trees"]},
      {"subject": "General Aptitude", "priority": "LOW", "topic": "Verbal & Reasoning", "subtopics": ["Grammar / Fill in the Blanks", "Vocabulary / Fill in the Blanks", "Syllogism"]}
    ]},
    {"week": 19, "focus_type": "Revision & PYQ Practice", "subjects": [
      {"subject": "Algorithms", "priority": "CRITICAL", "topic": "Comprehensive Revision", "subtopics": ["Asymptotic Notation", "Recurrence Relations", "Sorting", "Graph Algorithms", "Dynamic Programming", "Greedy Algorithms"]},
      {"subject": "Data Structures", "priority": "CRITICAL", "topic": "Comprehensive Revision", "subtopics": ["Arrays", "Linked List", "Stack & Queue", "Trees", "Heaps / Priority Queues", "Hashing"]},
      {"subject": "Programming and Data Structures", "priority": "CRITICAL", "topic": "Advanced C & Problem Solving", "subtopics": ["Bit Manipulation", "Program Output", "Static Variables and Loops"]}
    ]},
    {"week": 20, "focus_type": "Revision & PYQ Practice", "subjects": [
      {"subject": "Operating System", "priority": "CRITICAL", "topic": "Comprehensive Revision", "subtopics": ["Process Management", "Concurrency and Synchronization", "Deadlocks", "Memory Management", "Virtual Memory, Paging, TLB", "File Systems"]},
      {"subject": "Databases", "priority": "CRITICAL", "topic": "Comprehensive Revision", "subtopics": ["ER Model", "Relational Algebra", "SQL", "Functional Dependencies", "Normalization", "Indexing (B+ Tree)", "Transactions and Concurrency Control"]},
      {"subject": "Computer Networks", "priority": "HIGH", "topic": "Network Performance & Security", "subtopics": ["Network Performance", "Delay Calculation", "RSA Algorithm"]}
    ]},
    {"week": 21, "focus_type": "Revision & PYQ Practice", "subjects": [
      {"subject": "Computer Organization and Architecture", "priority": "HIGH", "topic": "Comprehensive Revision", "subtopics": ["Data Representation", "Instruction Format", "Pipelining", "Memory Hierarchy", "Cache Memory", "I/O (DMA, Polling vs. Interrupts)"]},
      {"subject": "Computer Networks", "priority": "HIGH", "topic": "Comprehensive Revision", "subtopics": ["Concept of Layering and LAN Technologies", "Data Communication and Networking", "IP Addressing", "TCP", "Application Layer Protocols", "Routing"]},
      {"subject": "Discrete Mathematics", "priority": "HIGH", "topic": "Advanced Graph Theory & Group Theory", "subtopics": ["Hamiltonian Cycles", "Group Theory", "Group Theory / Lagrange's Theorem"]}
    ]},
    {"week": 22, "focus_type": "Revision & PYQ Practice", "subjects": [
      {"subject": "Theory of Computation", "priority": "HIGH", "topic": "Comprehensive Revision", "subtopics": ["Finite Automata", "Regular Languages", "Context-Free Languages", "Decidability / Undecidability", "Language Hierarchy"]},
      {"subject": "Discrete Mathematics", "priority": "HIGH", "topic": "Comprehensive Revision", "subtopics": ["Set Theory", "Functions and Relations", "Propositional Logic", "Combinatorics", "Graph Theory", "Linear Recurrence Relations"]},
      {"subject": "Compiler Design", "priority": "MEDIUM", "topic": "Advanced Topics & Revision", "subtopics": ["Syntax Directed Translation", "Lexical Analysis, Parsing, Data Flow Analysis"]}
    ]},
    {"week": 23, "focus_type": "Mixed Problem Solving & Weak Topic Reinforcement", "subjects": [
      {"subject": "Algorithms", "priority": "CRITICAL", "topic": "Mixed Problem Solving", "subtopics": ["Time Complexity / Bit Manipulation", "Hashing", "Divide and Conquer"]},
      {"subject": "Operating System", "priority": "CRITICAL", "topic": "Mixed Problem Solving", "subtopics": ["fork and wait system calls", "Interrupt Handling", "Hard Disk Structure/Organization"]},
      {"subject": "Engineering Mathematics", "priority": "LOW", "topic": "Calculus & Probability", "subtopics": ["Functions and Limits", "Definite Integral", "Definite Integrals", "Local Maxima and Minima", "Probability / Dice", "Probability / Binomial Distribution"]}
    ]},
    {"week": 24, "focus_type": "Full Syllabus Mock Tests & Final Review", "subjects": [
      {"subject": "All Subjects", "priority": "CRITICAL", "topic": "Mock Tests & Quick Revision", "subtopics": ["Comprehensive review of all core concepts", "Formula recall and application", "Time management strategies for GATE"]},
      {"subject": "Computer Organization and Architecture", "priority": "HIGH", "topic": "Remaining Topics", "subtopics": ["Memory / DRAM / Refresh", "TLB, Cache, Page Tables", "RISC Architecture", "Parallel Processing"]},
      {"subject": "General Aptitude", "priority": "LOW", "topic": "Final Practice", "subtopics": ["Ratio and Proportion / Percentages", "Sequences and Series", "Word Problems / Arithmetic", "Quadratic Equations"]}
    ]}
  ]
}

PLAN_12M = {
  "duration_weeks": 48,
  "roadmap": [
    {"week": 1, "focus_type": "Core Learning", "subjects": [
      {"subject": "Programming and Data Structures", "priority": "CRITICAL", "topic": "C Programming", "subtopics": ["C Programming Basics", "Pointers and Arrays"]},
      {"subject": "Digital Logic", "priority": "MEDIUM", "topic": "Number Representation", "subtopics": ["Number System and Radix Conversion"]}
    ]},
    {"week": 2, "focus_type": "Core Learning", "subjects": [
      {"subject": "Programming and Data Structures", "priority": "CRITICAL", "topic": "C Programming", "subtopics": ["Function Calls, Variable Scope", "Recursion", "Loops and Control Flow"]}
    ]},
    {"week": 3, "focus_type": "Core Learning", "subjects": [
      {"subject": "Data Structures", "priority": "CRITICAL", "topic": "Basic Data Structures", "subtopics": ["Arrays", "Linked List"]},
      {"subject": "Digital Logic", "priority": "MEDIUM", "topic": "Number Representation", "subtopics": ["Two's Complement, Overflow"]}
    ]},
    {"week": 4, "focus_type": "Core Learning", "subjects": [
      {"subject": "Data Structures", "priority": "CRITICAL", "topic": "Basic Data Structures", "subtopics": ["Stacks and Queues"]},
      {"subject": "Digital Logic", "priority": "MEDIUM", "topic": "Boolean Algebra", "subtopics": ["Boolean Algebra Identities", "Boolean Operations/Algebraic Properties"]}
    ]},
    {"week": 5, "focus_type": "Core Learning", "subjects": [
      {"subject": "Algorithms", "priority": "CRITICAL", "topic": "Analysis of Algorithms", "subtopics": ["Asymptotic Notations", "Complexity Analysis"]},
      {"subject": "Discrete Mathematics", "priority": "HIGH", "topic": "Set Theory", "subtopics": ["Set Theory & Algebra"]}
    ]},
    {"week": 6, "focus_type": "Core Learning", "subjects": [
      {"subject": "Algorithms", "priority": "CRITICAL", "topic": "Analysis of Algorithms", "subtopics": ["Recurrence Relations and Analysis"]},
      {"subject": "Discrete Mathematics", "priority": "HIGH", "topic": "Logic", "subtopics": ["Propositional Logic"]}
    ]},
    {"week": 7, "focus_type": "Core Learning", "subjects": [
      {"subject": "Algorithms", "priority": "CRITICAL", "topic": "Sorting", "subtopics": ["Quicksort, Probability (analysis)", "Selection Algorithms"]}
    ]},
    {"week": 8, "focus_type": "Core Learning", "subjects": [
      {"subject": "Operating System", "priority": "CRITICAL", "topic": "Process Management", "subtopics": ["Process States", "Process Management Concepts"]},
      {"subject": "Computer Organization and Architecture", "priority": "HIGH", "topic": "Data Representation", "subtopics": ["Fixed Point Representation", "Floating Point", "IEEE 754 Standard"]}
    ]},
    {"week": 9, "focus_type": "Core Learning", "subjects": [
      {"subject": "Operating System", "priority": "CRITICAL", "topic": "Process Management", "subtopics": ["CPU Scheduling", "Round Robin Scheduling"]},
      {"subject": "Computer Organization and Architecture", "priority": "HIGH", "topic": "Instruction Set Architecture", "subtopics": ["Instruction Format / Encoding", "Machine Instruction & Addressing Format"]}
    ]},
    {"week": 10, "focus_type": "Core Learning", "subjects": [
      {"subject": "Databases", "priority": "CRITICAL", "topic": "ER Model", "subtopics": ["ER Model", "ER Model / Relationships", "Weak Entity Sets"]}
    ]},
    {"week": 11, "focus_type": "Core Learning", "subjects": [
      {"subject": "Databases", "priority": "CRITICAL", "topic": "Relational Model", "subtopics": ["Relational Model", "Relational Model Concepts"]},
      {"subject": "Computer Networks", "priority": "HIGH", "topic": "Network Basics", "subtopics": ["Concept of Layering and LAN Technologies"]}
    ]},
    {"week": 12, "focus_type": "Core Learning", "subjects": [
      {"subject": "Computer Networks", "priority": "HIGH", "topic": "Data Link Layer", "subtopics": ["MAC Protocols / Carrier Sense / Collision Avoidance", "Flow and Error Control"]},
      {"subject": "Theory of Computation", "priority": "HIGH", "topic": "Finite Automata", "subtopics": ["DFA", "NFA to DFA Conversion"]}
    ]},
    {"week": 13, "focus_type": "Core Learning", "subjects": [
      {"subject": "Theory of Computation", "priority": "HIGH", "topic": "Regular Languages", "subtopics": ["Regular Expressions", "Regular Languages"]},
      {"subject": "Discrete Mathematics", "priority": "HIGH", "topic": "Logic", "subtopics": ["Predicate Logic"]}
    ]},
    {"week": 14, "focus_type": "Core Learning", "subjects": [
      {"subject": "Algorithms", "priority": "CRITICAL", "topic": "Divide and Conquer", "subtopics": ["Maximum Subarray Sum"]},
      {"subject": "Data Structures", "priority": "CRITICAL", "topic": "Trees", "subtopics": ["Trees / Binary Tree Traversal"]}
    ]},
    {"week": 15, "focus_type": "Core Learning", "subjects": [
      {"subject": "Algorithms", "priority": "CRITICAL", "topic": "Graph Algorithms", "subtopics": ["DFS and BFS", "Graph Algorithms / DFS / BFS"]},
      {"subject": "Operating System", "priority": "CRITICAL", "topic": "Concurrency and Synchronization", "subtopics": ["Concurrency", "Process Synchronization / Semaphores / Producer-Consumer"]}
    ]},
    {"week": 16, "focus_type": "Core Learning", "subjects": [
      {"subject": "Operating System", "priority": "CRITICAL", "topic": "Deadlocks", "subtopics": ["Deadlocks", "Deadlock detection and prevention", "Deadlock / Resource Allocation"]},
      {"subject": "Computer Organization and Architecture", "priority": "HIGH", "topic": "Pipelining", "subtopics": ["Instruction Pipelining", "Instruction Pipeline / Clock Cycles"]}
    ]},
    {"week": 17, "focus_type": "Core Learning", "subjects": [
      {"subject": "Operating System", "priority": "CRITICAL", "topic": "Deadlocks", "subtopics": ["Deadlock / Banker's Algorithm"]},
      {"subject": "Computer Organization and Architecture", "priority": "HIGH", "topic": "Pipelining", "subtopics": ["Control Hazards, Branch Prediction, Speedup"]}
    ]},
    {"week": 18, "focus_type": "Core Learning", "subjects": [
      {"subject": "Databases", "priority": "CRITICAL", "topic": "Functional Dependencies", "subtopics": ["Functional Dependencies", "Functional Dependencies, Keys"]},
      {"subject": "Computer Networks", "priority": "HIGH", "topic": "Network Layer", "subtopics": ["IP Addressing", "Subnetting"]}
    ]},
    {"week": 19, "focus_type": "Core Learning", "subjects": [
      {"subject": "Databases", "priority": "CRITICAL", "topic": "Normalization", "subtopics": ["Normalization", "Normalization / 3NF / BCNF", "BCNF, Dependency Preservation, Lossless Decomposition"]},
      {"subject": "Computer Networks", "priority": "HIGH", "topic": "Network Layer", "subtopics": ["IP Fragmentation", "Routing", "Distance Vector Routing"]}
    ]},
    {"week": 20, "focus_type": "Core Learning", "subjects": [
      {"subject": "Databases", "priority": "CRITICAL", "topic": "Relational Algebra & SQL", "subtopics": ["Relational Algebra / Joins / Outer Join", "SQL / Joins"]},
      {"subject": "Computer Networks", "priority": "HIGH", "topic": "Transport Layer", "subtopics": ["TCP", "TCP Handshake", "TCP Congestion Control / Slow Start"]}
    ]},
    {"week": 21, "focus_type": "Core Learning", "subjects": [
      {"subject": "Databases", "priority": "CRITICAL", "topic": "Indexing", "subtopics": ["Indexing", "B+ Trees", "Indexing (B+ Tree)"]},
      {"subject": "Computer Networks", "priority": "HIGH", "topic": "Application Layer", "subtopics": ["HTTP and DNS", "Email Protocols"]}
    ]},
    {"week": 22, "focus_type": "Core Learning", "subjects": [
      {"subject": "Databases", "priority": "CRITICAL", "topic": "Transactions and Concurrency Control", "subtopics": ["Transactions and Concurrency Control", "ACID Properties", "Conflict Equivalence / Serializability"]},
      {"subject": "Operating System", "priority": "CRITICAL", "topic": "Memory Management", "subtopics": ["Memory Allocation", "Memory Management / Demand Paging / Page Fault"]}
    ]},
    {"week": 23, "focus_type": "Core Learning", "subjects": [
      {"subject": "Operating System", "priority": "CRITICAL", "topic": "Memory Management & Virtual Memory", "subtopics": ["Virtual Memory, Paging, TLB", "Paging", "Paging / Page Replacement Algorithms (LRU)"]},
      {"subject": "Theory of Computation", "priority": "HIGH", "topic": "Context-Free Languages", "subtopics": ["Context-Free Grammars", "Context-Free Languages", "Properties of Context-Free Languages"]}
    ]},
    {"week": 24, "focus_type": "Core Learning", "subjects": [
      {"subject": "Computer Organization and Architecture", "priority": "HIGH", "topic": "Cache Memory", "subtopics": ["Cache Memory", "Direct Mapped Cache, Cache Hits/Misses", "Fully Associative Cache", "Cache Memory / Set-Associative Cache / Tag Field"]},
      {"subject": "Theory of Computation", "priority": "HIGH", "topic": "Computability", "subtopics": ["Language Hierarchy", "Decidability / Undecidability", "Recursively Enumerable Languages"]}
    ]},
    {"week": 25, "focus_type": "Core Learning", "subjects": [
      {"subject": "Compiler Design", "priority": "MEDIUM", "topic": "Lexical Analysis", "subtopics": ["Compiler Phases / Basics", "Phases of Compiler", "Lexical Analysis", "Lexical Analysis / Regular Expressions / Longest Match"]},
      {"subject": "Discrete Mathematics", "priority": "HIGH", "topic": "Combinatorics", "subtopics": ["Combinatorics", "Permutations and Combinations"]}
    ]},
    {"week": 26, "focus_type": "Core Learning", "subjects": [
      {"subject": "Compiler Design", "priority": "MEDIUM", "topic": "Parsing", "subtopics": ["Parser Types", "LR Parsers", "LR Parsing"]},
      {"subject": "Discrete Mathematics", "priority": "HIGH", "topic": "Graph Theory", "subtopics": ["Graph Theory", "Graph Theory / Degree / Connected Components", "Spanning Trees"]}
    ]},
    {"week": 27, "focus_type": "Core Learning", "subjects": [
      {"subject": "Engineering Mathematics", "priority": "MEDIUM", "topic": "Linear Algebra", "subtopics": ["Matrices", "Matrices and Determinants", "Eigenvalues and Eigenvectors"]},
      {"subject": "Discrete Mathematics", "priority": "HIGH", "topic": "Logic", "subtopics": ["First-Order Logic / Models"]}
    ]},
    {"week": 28, "focus_type": "Core Learning", "subjects": [
      {"subject": "Engineering Mathematics", "priority": "MEDIUM", "topic": "Probability", "subtopics": ["Events and Probability", "Probability", "Conditional Probability", "Probability / Bayes' Theorem"]},
      {"subject": "Algorithms", "priority": "CRITICAL", "topic": "Dynamic Programming", "subtopics": ["Dynamic Programming / Matrix Chain Multiplication"]}
    ]},
    {"week": 29, "focus_type": "Core Learning", "subjects": [
      {"subject": "Algorithms", "priority": "CRITICAL", "topic": "Greedy Algorithms", "subtopics": ["Greedy Algorithms / Knapsack"]},
      {"subject": "Algorithms", "priority": "CRITICAL", "topic": "Graph Theory", "subtopics": ["Minimum Spanning Tree", "Shortest Path"]}
    ]},
    {"week": 30, "focus_type": "Core Learning", "subjects": [
      {"subject": "Digital Logic", "priority": "MEDIUM", "topic": "Combinational Circuits", "subtopics": ["Boolean Functions / Prime Implicants / K-Map", "Logic Gate Implementation", "Multiplexers"]},
      {"subject": "General Aptitude", "priority": "LOW", "topic": "Numerical Ability", "subtopics": ["Algebra / Exponents", "Geometry / Area", "Number Theory / LCM"]}
    ]},
    {"week": 31, "focus_type": "Core Learning", "subjects": [
      {"subject": "Computer Organization and Architecture", "priority": "HIGH", "topic": "Cache Memory", "subtopics": ["Cache Mapping", "Cache Policies", "Average Memory Access Time (AMAT)"]},
      {"subject": "General Aptitude", "priority": "LOW", "topic": "Verbal & Reasoning", "subtopics": ["Grammar / Fill in the Blanks", "Vocabulary / Fill in the Blanks", "Syllogism"]}
    ]},
    {"week": 32, "focus_type": "Core Learning", "subjects": [
      {"subject": "Engineering Mathematics", "priority": "MEDIUM", "topic": "Calculus", "subtopics": ["Functions and Limits", "Definite Integral", "Local Maxima and Minima"]},
      {"subject": "Discrete Mathematics", "priority": "HIGH", "topic": "Combinatorics Advanced", "subtopics": ["Generating Functions", "Generating Functions / Sequences"]}
    ]},
    {"week": 33, "focus_type": "Revision & PYQ Practice", "subjects": [
      {"subject": "Algorithms", "priority": "CRITICAL", "topic": "Comprehensive Revision", "subtopics": ["Asymptotic Notation", "Recurrence Relations", "Sorting", "Graph Algorithms", "Dynamic Programming", "Greedy Algorithms"]},
      {"subject": "Data Structures", "priority": "CRITICAL", "topic": "Comprehensive Revision", "subtopics": ["Arrays", "Linked List", "Stack & Queue", "Trees", "Heaps / Priority Queues", "Hashing"]}
    ]},
    {"week": 34, "focus_type": "Revision & PYQ Practice", "subjects": [
      {"subject": "Operating System", "priority": "CRITICAL", "topic": "Comprehensive Revision", "subtopics": ["Process Management", "Concurrency and Synchronization", "Deadlocks", "Memory Management", "Virtual Memory, Paging, TLB", "File Systems"]},
      {"subject": "Programming and Data Structures", "priority": "CRITICAL", "topic": "Advanced C & Problem Solving", "subtopics": ["Bit Manipulation", "Program Output", "Static Variables and Loops"]}
    ]},
    {"week": 35, "focus_type": "Revision & PYQ Practice", "subjects": [
      {"subject": "Databases", "priority": "CRITICAL", "topic": "Comprehensive Revision", "subtopics": ["ER Model", "Relational Algebra", "SQL", "Functional Dependencies", "Normalization", "Indexing (B+ Tree)", "Transactions and Concurrency Control"]},
      {"subject": "Computer Networks", "priority": "HIGH", "topic": "Comprehensive Revision", "subtopics": ["Concept of Layering and LAN Technologies", "Data Link Layer", "IP Addressing", "TCP", "Application Layer Protocols", "Routing"]}
    ]},
    {"week": 36, "focus_type": "Revision & PYQ Practice", "subjects": [
      {"subject": "Computer Organization and Architecture", "priority": "HIGH", "topic": "Comprehensive Revision", "subtopics": ["Data Representation", "Instruction Format", "Pipelining", "Memory Hierarchy", "Cache Memory", "I/O (DMA, Polling vs. Interrupts)"]},
      {"subject": "Theory of Computation", "priority": "HIGH", "topic": "Comprehensive Revision", "subtopics": ["Finite Automata", "Regular Languages", "Context-Free Languages", "Decidability / Undecidability", "Language Hierarchy"]}
    ]},
    {"week": 37, "focus_type": "Revision & PYQ Practice", "subjects": [
      {"subject": "Discrete Mathematics", "priority": "HIGH", "topic": "Comprehensive Revision", "subtopics": ["Set Theory", "Functions and Relations", "Propositional Logic", "Combinatorics", "Graph Theory"]},
      {"subject": "Compiler Design", "priority": "MEDIUM", "topic": "Comprehensive Revision", "subtopics": ["Syntax Directed Translation", "Lexical Analysis, Parsing, Data Flow Analysis"]}
    ]},
    {"week": 38, "focus_type": "Revision & PYQ Practice", "subjects": [
      {"subject": "Engineering Mathematics", "priority": "MEDIUM", "topic": "Comprehensive Revision", "subtopics": ["Matrices and Determinants", "Eigenvalues and Eigenvectors", "Probability", "Definite Integrals"]},
      {"subject": "Digital Logic", "priority": "MEDIUM", "topic": "Comprehensive Revision", "subtopics": ["Number Representation", "Boolean Algebra", "Combinational Circuits", "Sequential Circuits"]}
    ]},
    {"week": 39, "focus_type": "Mixed Problem Solving & Weak Topic Reinforcement", "subjects": [
      {"subject": "Algorithms", "priority": "CRITICAL", "topic": "Mixed Problem Solving", "subtopics": ["Time Complexity / Bit Manipulation", "Hashing", "Divide and Conquer"]},
      {"subject": "Operating System", "priority": "CRITICAL", "topic": "Mixed Problem Solving", "subtopics": ["fork and wait system calls", "Interrupt Handling", "Hard Disk Structure/Organization"]}
    ]},
    {"week": 40, "focus_type": "Mixed Problem Solving & Weak Topic Reinforcement", "subjects": [
      {"subject": "Databases", "priority": "CRITICAL", "topic": "Mixed Problem Solving", "subtopics": ["Complex SQL Queries", "Lock-based Protocols", "Recovery Techniques"]},
      {"subject": "Computer Networks", "priority": "HIGH", "topic": "Mixed Problem Solving", "subtopics": ["Network Performance", "Delay Calculation", "RSA Algorithm"]}
    ]},
    {"week": 41, "focus_type": "Mixed Problem Solving & Weak Topic Reinforcement", "subjects": [
      {"subject": "Theory of Computation", "priority": "HIGH", "topic": "Mixed Problem Solving", "subtopics": ["PDA and CFL", "Ambiguous Grammars", "Closure Properties"]},
      {"subject": "Discrete Mathematics", "priority": "HIGH", "topic": "Advanced Topics", "subtopics": ["Hamiltonian Cycles", "Group Theory", "Group Theory / Lagrange's Theorem", "Linear Recurrence Relations"]}
    ]},
    {"week": 42, "focus_type": "Mixed Problem Solving & Weak Topic Reinforcement", "subjects": [
      {"subject": "Compiler Design", "priority": "MEDIUM", "topic": "Advanced Topics", "subtopics": ["Code Optimization", "Register Allocation", "FIRST and FOLLOW Sets"]},
      {"subject": "Computer Organization and Architecture", "priority": "HIGH", "topic": "Advanced Topics", "subtopics": ["Memory / DRAM / Refresh", "TLB, Cache, Page Tables", "RISC Architecture", "Parallel Processing"]}
    ]},
    {"week": 43, "focus_type": "Mixed Problem Solving & Weak Topic Reinforcement", "subjects": [
      {"subject": "Engineering Mathematics", "priority": "MEDIUM", "topic": "Advanced Topics", "subtopics": ["Probability / Dice", "Probability / Binomial Distribution", "Sequences and Series"]},
      {"subject": "General Aptitude", "priority": "LOW", "topic": "Practice", "subtopics": ["Ratio and Proportion / Percentages", "Word Problems / Arithmetic", "Quadratic Equations"]}
    ]},
    {"week": 44, "focus_type": "Full Syllabus Mock Tests & Final Review", "subjects": [
      {"subject": "All Subjects", "priority": "CRITICAL", "topic": "Mock Test - Set 1", "subtopics": ["Algorithms", "Data Structures", "Programming and Data Structures", "Operating System"]}
    ]},
    {"week": 45, "focus_type": "Full Syllabus Mock Tests & Final Review", "subjects": [
      {"subject": "All Subjects", "priority": "CRITICAL", "topic": "Mock Test - Set 2", "subtopics": ["Databases", "Computer Networks", "Computer Organization and Architecture", "Theory of Computation"]}
    ]},
    {"week": 46, "focus_type": "Full Syllabus Mock Tests & Final Review", "subjects": [
      {"subject": "All Subjects", "priority": "CRITICAL", "topic": "Mock Test - Set 3", "subtopics": ["Discrete Mathematics", "Engineering Mathematics", "Compiler Design", "Digital Logic"]}
    ]},
    {"week": 47, "focus_type": "Full Syllabus Mock Tests & Final Review", "subjects": [
      {"subject": "All Subjects", "priority": "CRITICAL", "topic": "Full Syllabus Mock Test", "subtopics": ["Comprehensive review of all core concepts", "Formula recall and application", "Timed practice under exam conditions"]}
    ]},
    {"week": 48, "focus_type": "Full Syllabus Mock Tests & Final Review", "subjects": [
      {"subject": "All Subjects", "priority": "CRITICAL", "topic": "Final Revision & Strategy", "subtopics": ["Key formula sheets", "Time management strategies for GATE", "Last-minute weak topic reinforcement"]}
    ]}
  ]
}


TEMPLATES = [
    {
        "id": "b8acc4cc-a312-46eb-8f8b-1c8e27d3854c",
        "exam": "GATE_CSE_PYQ",
        "duration_months": 3,
        "plan": PLAN_3M,
    },
    {
        "id": "36f9b85e-8ccb-4037-aef4-d0a517a9f836",
        "exam": "GATE_CSE_PYQ",
        "duration_months": 6,
        "plan": PLAN_6M,
    },
    {
        "id": "df2dc190-7826-45e4-98b9-c1066269e2a6",
        "exam": "GATE_CSE_PYQ",
        "duration_months": 12,
        "plan": PLAN_12M,
    },
]


async def seed():
    db_url = _get_db_url()
    print(f"Connecting to: {db_url}")
    conn = await asyncpg.connect(db_url)

    inserted = 0
    skipped = 0
    for t in TEMPLATES:
        plan_json = json.dumps(t["plan"], ensure_ascii=False)
        result = await conn.execute(
            """
            INSERT INTO study_plan_templates (id, exam, duration_months, plan, created_at)
            VALUES ($1::uuid, $2, $3, $4, $5)
            ON CONFLICT (exam, duration_months) DO NOTHING
            """,
            t["id"],
            t["exam"],
            t["duration_months"],
            plan_json,
            datetime.utcnow(),
        )
        if result == "INSERT 0 1":
            print(f"  [INSERTED] {t['exam']} -- {t['duration_months']} month(s)  (id={t['id']})")
            inserted += 1
        else:
            print(f"  [SKIPPED]  {t['exam']} -- {t['duration_months']} month(s) (already exists)")
            skipped += 1

    await conn.close()
    print(f"\nDone. {inserted} inserted, {skipped} skipped.")


if __name__ == "__main__":
    asyncio.run(seed())
