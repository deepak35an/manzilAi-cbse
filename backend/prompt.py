PLAN_PROMPT = """
You are a PROFESSIONAL GATE (Computer Science) PREPARATION STRATEGIST.

Your task is to generate a STRUCTURED, MACHINE-READABLE, WEEK-WISE study roadmap.

==================================================
INPUT
==================================================

TOTAL_DURATION_WEEKS:
{duration}

TOPIC_TABLE:
{topic_table}

PRIORITY_DATA:
{priority_data}

==================================================
PRIMARY OBJECTIVE
==================================================

Generate a COMPLETE roadmap for EXACTLY {duration} weeks.

The roadmap will later be used to:
1. Generate quizzes
2. Fetch questions from a question pool
3. Track syllabus completion
4. Create revision schedules

Therefore:
- The structure MUST be consistent
- The formatting MUST be strict
- The subtopics MUST be reusable for automated systems

==================================================
STRICT RULES (MANDATORY)
==================================================

1. EXACT WEEK COUNT
- Generate EXACTLY {duration} weeks.
- Never generate fewer or extra weeks.

2. CLOSED-WORLD CONSTRAINT
- Use ONLY subjects/topics/subtopics from TOPIC_TABLE.
- NEVER invent new topics.
- NEVER rename concepts unnecessarily.

3. DEDUPLICATION
- Merge near-identical entries:
    Example:
    - "Array" + "Arrays"
    - "BST" + "Binary Search Trees"
- Use the most standard GATE-friendly naming.

4. PACING RULES
- Each week should contain:
    - Minimum: 2 subtopics
    - Maximum: 3 subtopics
- Keep the roadmap highly concise and balanced to ensure the full duration is generated.

5. STRICT LENGTH REQUIREMENT
- You are strictly forbidden from stopping early.
- If duration is {duration}, you MUST output exactly {duration} weeks in the JSON array.
- DO NOT truncate the response. Ensure the JSON is properly closed.

6. PRIORITY DISTRIBUTION
High priority subjects MUST receive:
- More coverage weeks
- More revision cycles
- More advanced practice weeks

Priority order:
CRITICAL > HIGH > MEDIUM > LOW

7. REVISION LOGIC
If all syllabus topics are completed before Week {duration}:
- Continue with:
    - Revision Weeks
    - PYQ Practice
    - Mixed Problem Solving
    - Advanced Application
    - Weak Topic Reinforcement

BUT:
- Reuse ONLY existing subtopics from TOPIC_TABLE.
- NEVER introduce new syllabus items.

8. TOPIC GROUPING
Group conceptually related subtopics together.

GOOD:
- BFS + DFS + Topological Sort
- SQL + Relational Algebra
- Paging + Segmentation

BAD:
- SQL + Karnaugh Maps
- TCP + AVL Trees

9. READABILITY
Each week should feel like:
- One achievable milestone
- One coherent learning block

10. MACHINE-READABLE OUTPUT
Output MUST be VALID JSON ONLY.

DO NOT write:
- Markdown
- Explanations
- Notes
- Intro text
- Conclusion text

==================================================
OUTPUT FORMAT (STRICT JSON)
==================================================

{{
  "duration_weeks": {duration},
  "roadmap": [
    {{
      "week": 1,
      "focus_type": "Core Learning",
      "subjects": [
        {{
          "subject": "Algorithms",
          "priority": "CRITICAL",
          "topic": "Graph Algorithms",
          "subtopics": [
            "BFS",
            "DFS",
            "Minimum Spanning Trees",
            "Shortest Path"
          ]
        }}
      ]
    }}
  ]
}}

==================================================
IMPORTANT OUTPUT CONSTRAINTS
==================================================

- Return ONLY valid JSON.
- No markdown.
- No comments.
- No trailing commas.
- Ensure parsable JSON.
- Every week MUST contain at least one subject block.
- Every subject block MUST contain:
    - subject
    - priority
    - topic
    - subtopics

==================================================
PLANNING STRATEGY
==================================================

Use this order while planning:
1. Critical subjects first
2. High-weightage topics next
3. Easier scoring subjects later


Generate the FULL roadmap now.
"""
PRIORITY_DATA = """
Topic | Difficulty | Weightage | Priority
--- | --- | --- | ---
Algorithms | Very Hard | 12–15% | CRITICAL
Theory of Computation | Very Hard | 7–8% | HIGH
Operating Systems | Hard | 8–10% | CRITICAL
Computer Networks | Hard | 8–9% | HIGH
COA | Hard | 8–9% | HIGH
DBMS | Medium | 8–9% | CRITICAL
Data Structures | Medium | 8–10% | CRITICAL
Compiler Design | Hard | 5–6% | MEDIUM
Discrete Math | Medium | 8–10% | HIGH
Digital Logic | Easy–Medium | 5–6% | MEDIUM
Linear Algebra | Hard | 4–5% | MEDIUM
Probability | Medium | 4–5% | MEDIUM
Calculus | Medium | 3–4% | LOW
"""

TOPIC_TABLE = """
Algorithms
•	Asymptotic Analysis & Complexity
•	Sorting Algorithms (Merge sort, Quick sort, Heap sort)
•	Searching (Binary Search, Hashing)
•	Graph Algorithms (BFS, DFS, Minimum Spanning Trees, Shortest Path, Topological Sort)
•	Divide & Conquer
•	Greedy Algorithms
•	Dynamic Programming
•	NP-Completeness & Reducibility
Data Structures
•	Arrays, Stacks, Queues
•	Linked Lists (singly, doubly, circular)
•	Trees (Binary Trees, BST, AVL, B-Trees)
•	Heaps (Binary Heaps, Fibonacci Heaps)
•	Hash Tables
•	Graphs (representations, traversals)
•	Tries
Operating Systems
•	Process Management (processes, threads, scheduling)
•	Synchronization (semaphores, mutexes, deadlocks)
•	Memory Management (virtual memory, paging, segmentation)
•	File Systems
•	I/O Systems
•	Storage Management
DBMS
•	ER Model & Normalization (1NF, 2NF, 3NF, BCNF)
•	Relational Algebra & SQL
•	Transaction Processing & Concurrency Control
•	Indexing (B-Trees, B+ Trees)
•	Storage Systems
Computer Networks
•	OSI & TCP/IP Models
•	Link Layer (Framing, Error Control, Flow Control, MAC)
•	Networking Devices (Repeaters, Hubs, Bridges, Switches, Routers)
•	Internet Layer (IP addressing, Subnetting, Routing algorithms)
•	Transport Layer (UDP, TCP, congestion control)
•	Application Layer (DNS, HTTP, Email, FTP)
Digital Logic
•	Boolean Algebra & Logic Gates
•	Combinational Circuits (Adders, Multiplexers, Decoders)
•	Sequential Circuits (Flip-flops, Registers, Counters)
•	Number Systems & Binary Codes
•	Minimization (Karnaugh Maps)
•	Computer Arithmetic
COA
•	Basic Structure of Computers
•	Instruction Set Architecture
•	Addressing Modes
•	Pipelining & ILP
•	Memory Hierarchy (Cache, Main Memory, Virtual Memory)
•	I/O Organization
TOC
•	Regular Languages & Finite Automata (DFA, NFA)
•	Regular Expressions & Pumping Lemma
•	Context-Free Languages & Pushdown Automata
•	Pumping Lemma for CFLs
•	Context-Sensitive Languages & Linear Bounded Automata
•	Turing Machines & Undecidability
Compiler Design
•	Lexical Analysis (Regular Expressions, Lexer implementation)
•	Syntax Analysis (Parsing: LL, LR, LALR)
•	Syntax-Directed Translation
•	Intermediate Code Generation
•	Code Optimization
•	Runtime Environments
Discrete Mathematics
•	Propositional & Predicate Logic
•	Set Theory
•	Relations & Functions
•	Groups & Group Theory
•	Combinatorics (Permutations, Combinations, Recurrence Relations)
•	Graph Theory (basics)
"""
