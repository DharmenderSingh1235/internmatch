/* js/interview-questions.js
   Question bank for interview-prep.html. Each technical category has 5
   multiple-choice questions; add more by following the same shape. */

const INTERVIEW_QUESTIONS = {
  Python: [
    {
      question: "What is the output of `print(type([]))` in Python?",
      options: ["<class 'list'>", "<class 'array'>", "<class 'tuple'>", "<class 'dict'>"],
      correctIndex: 0
    },
    {
      question: "Which keyword is used to define a function in Python?",
      options: ["func", "def", "function", "lambda"],
      correctIndex: 1
    },
    {
      question: "What does `len()` return when called on a string?",
      options: ["The memory address", "The number of characters", "The ASCII sum", "Always zero"],
      correctIndex: 1
    },
    {
      question: "Which data structure does Python's `dict` implement?",
      options: ["Hash map", "Linked list", "Binary tree", "Stack"],
      correctIndex: 0
    },
    {
      question: "What is the correct way to open a file for reading safely in Python?",
      options: ["open('f.txt').read()", "with open('f.txt') as f: data = f.read()", "file.read('f.txt')", "read('f.txt')"],
      correctIndex: 1
    },
    {
      question: "What does `dict.get('missing')` return when the key is absent and no default is supplied?",
      options: ["None", "KeyError", "False", "An empty dictionary"],
      correctIndex: 0
    },
    {
      question: "What is the result of `[n * n for n in [1, 2, 3] if n > 1]`?",
      options: ["[4, 9]", "[1, 4, 9]", "[2, 3]", "[1, 2, 3, 4, 9]"],
      correctIndex: 0
    }
  ],
  Java: [
    {
      question: "Which keyword makes a class unable to be extended in Java?",
      options: ["static", "final", "private", "abstract"],
      correctIndex: 1
    },
    {
      question: "What is the default value of a boolean instance variable in Java?",
      options: ["true", "null", "false", "0"],
      correctIndex: 2
    },
    {
      question: "Which of these is not a primitive type in Java?",
      options: ["int", "String", "boolean", "char"],
      correctIndex: 1
    },
    {
      question: "What does the JVM stand for?",
      options: ["Java Virtual Machine", "Java Variable Method", "Joint Virtual Machine", "Java Verified Module"],
      correctIndex: 0
    },
    {
      question: "Which collection maintains insertion order in Java?",
      options: ["HashSet", "HashMap", "ArrayList", "TreeSet"],
      correctIndex: 2
    }
  ],
  SQL: [
    {
      question: "Which SQL clause is used to filter groups after a GROUP BY?",
      options: ["WHERE", "HAVING", "FILTER", "GROUP FILTER"],
      correctIndex: 1
    },
    {
      question: "Which JOIN returns only matching rows from both tables?",
      options: ["LEFT JOIN", "RIGHT JOIN", "INNER JOIN", "FULL OUTER JOIN"],
      correctIndex: 2
    },
    {
      question: "Which keyword removes duplicate rows from a result set?",
      options: ["UNIQUE", "DISTINCT", "REMOVE DUPES", "FILTER"],
      correctIndex: 1
    },
    {
      question: "What does a PRIMARY KEY constraint guarantee?",
      options: ["Sorted rows", "Unique, non-null identification of a row", "Fast joins only", "Case-insensitive text"],
      correctIndex: 1
    },
    {
      question: "Which statement adds a new row to a table?",
      options: ["UPDATE", "INSERT INTO", "ADD ROW", "CREATE"],
      correctIndex: 1
    }
  ],
  Cloud: [
    {
      question: "What does 'IaaS' stand for in cloud computing?",
      options: ["Infrastructure as a Service", "Internet as a Service", "Instance as a Service", "Identity as a Service"],
      correctIndex: 0
    },
    {
      question: "Which of these is a core benefit of cloud auto-scaling?",
      options: ["Fixed monthly cost", "Matching capacity to real-time demand", "Removing the need for monitoring", "Guaranteed zero downtime"],
      correctIndex: 1
    },
    {
      question: "What is a 'region' in most cloud platforms?",
      options: ["A billing tier", "A geographic area containing data centers", "A type of virtual machine", "A security group"],
      correctIndex: 1
    },
    {
      question: "Which service model gives the most control over the operating system?",
      options: ["SaaS", "PaaS", "IaaS", "FaaS"],
      correctIndex: 2
    },
    {
      question: "What is the main purpose of a load balancer?",
      options: ["Encrypt data at rest", "Distribute traffic across multiple servers", "Compress storage", "Manage DNS records only"],
      correctIndex: 1
    }
  ],
  AI: [
    {
      question: "What does 'overfitting' mean in machine learning?",
      options: ["The model performs well on new data", "The model memorizes training data but generalizes poorly", "The model trains too fast", "The dataset is too small to load"],
      correctIndex: 1
    },
    {
      question: "Which of these is a supervised learning task?",
      options: ["Clustering customers into segments", "Predicting house prices from labeled data", "Reducing dimensionality of data", "Generating random noise"],
      correctIndex: 1
    },
    {
      question: "What is the purpose of a loss function?",
      options: ["To store the dataset", "To measure how far predictions are from actual values", "To visualize data", "To split data into batches"],
      correctIndex: 1
    },
    {
      question: "What does 'NLP' stand for?",
      options: ["Natural Language Processing", "Neural Learning Protocol", "Numeric Language Parsing", "Network Level Programming"],
      correctIndex: 0
    },
    {
      question: "Which technique helps reduce overfitting?",
      options: ["Increasing model size indefinitely", "Regularization", "Removing all training data", "Ignoring validation loss"],
      correctIndex: 1
    }
  ],
  "Analytical reasoning": [
    {
      question: "A product's price rises by 20%, then falls by 20%. Compared with the original price, what is the final price?",
      options: ["The same", "4% lower", "4% higher", "8% lower"],
      correctIndex: 1
    },
    {
      question: "Find the next number: 3, 7, 15, 31, …",
      options: ["47", "55", "63", "64"],
      correctIndex: 2
    },
    {
      question: "A team completes 40% of a task in 6 days at a steady rate. How many days are needed for the whole task?",
      options: ["12", "15", "18", "24"],
      correctIndex: 1
    },
    {
      question: "All analysts use data. Some interns are analysts. Which conclusion must be true?",
      options: ["All interns use data", "Some interns use data", "No interns use data", "All data users are analysts"],
      correctIndex: 1
    },
    {
      question: "A bag has 3 red and 2 blue tokens. What is the probability of drawing a blue token on one random draw?",
      options: ["1/5", "2/5", "3/5", "1/2"],
      correctIndex: 1
    }
  ],
  "Coding logic": [
    {
      question: "What does this Python code print?  `values = [2, 4, 6]; print(sum(values) // len(values))`",
      options: ["3", "4", "12", "2"],
      correctIndex: 1
    },
    {
      question: "What is the time complexity of binary search on a sorted array?",
      options: ["O(1)", "O(log n)", "O(n)", "O(n²)"],
      correctIndex: 1
    },
    {
      question: "Which data structure is most suitable for checking whether matching brackets are balanced?",
      options: ["Queue", "Stack", "Graph", "Hash table only"],
      correctIndex: 1
    },
    {
      question: "What is printed by `for (let i = 0; i < 3; i++) console.log(i)`?",
      options: ["1, 2, 3", "0, 1, 2", "0, 1, 2, 3", "3 only"],
      correctIndex: 1
    },
    {
      question: "You need to find duplicates in a list efficiently. Which approach is usually best?",
      options: ["Compare every pair", "Track seen values in a Set", "Sort by original index", "Use recursion only"],
      correctIndex: 1
    },
    {
      question: "A function receives a sorted array. Which search method can find a target in O(log n) time?",
      options: ["Binary search", "Linear scan", "Bubble sort", "Depth-first search"],
      correctIndex: 0
    },
    {
      question: "You need to check whether every opening bracket has a matching closing bracket in the right order. What should you use?",
      options: ["A stack", "A queue", "A min-heap", "A sorted array"],
      correctIndex: 0
    }
  ],
  "Google-style coding": [
    {
      question: "Given an array and a target, which approach finds whether two values sum to the target in expected O(n) time?",
      options: ["Sort and compare all pairs", "Store visited values in a hash set", "Use nested loops", "Reverse the array first"],
      correctIndex: 1
    },
    {
      question: "A sorted array may contain duplicates. Which method removes duplicates in-place using O(1) extra space?",
      options: ["Two pointers: write each new value once", "Use a second array", "Compare every pair and shift each time", "Use breadth-first search"],
      correctIndex: 0
    },
    {
      question: "Which traversal finds the shortest path in an unweighted graph?",
      options: ["Depth-first search", "Breadth-first search", "In-order traversal", "Quick sort"],
      correctIndex: 1
    },
    {
      question: "What is the worst-case time complexity of binary search on a sorted array?",
      options: ["O(1)", "O(log n)", "O(n)", "O(n log n)"],
      correctIndex: 1
    },
    {
      question: "For a longest-substring problem with a uniqueness condition, which technique often keeps the scan linear?",
      options: ["Sliding window with a set or map", "Repeatedly sort the full string", "Use a stack for every substring", "Try every substring and recount"],
      correctIndex: 0
    },
    {
      question: "When traversing a graph that may contain cycles, why keep a visited set?",
      options: ["To sort neighbors", "To avoid revisiting nodes and looping forever", "To reduce the graph's vertex count", "To guarantee a weighted shortest path"],
      correctIndex: 1
    }
  ],
  "Microsoft-style coding": [
    {
      question: "Which approach reverses an array in-place with constant extra space?",
      options: ["Swap elements from both ends with two pointers", "Copy every item to a second array", "Sort the array", "Use a queue and a second array"],
      correctIndex: 0
    },
    {
      question: "You need to detect a cycle in a singly linked list using O(1) extra space. Which method is suitable?",
      options: ["Store every node in a list", "Floyd's slow and fast pointers", "Sort the linked list", "Use binary search"],
      correctIndex: 1
    },
    {
      question: "What is the output of this Python expression? `list(range(2, 7, 2))`",
      options: ["[2, 4, 6]", "[2, 4, 6, 8]", "[2, 3, 4, 5, 6]", "[4, 6]"],
      correctIndex: 0
    },
    {
      question: "Which structure is commonly used to implement a queue with first-in, first-out behavior?",
      options: ["A stack only", "A deque", "A binary search tree", "A set"],
      correctIndex: 1
    },
    {
      question: "A loop halves the remaining input size each iteration. What is its time complexity?",
      options: ["O(1)", "O(log n)", "O(n)", "O(n²)"],
      correctIndex: 1
    },
    {
      question: "Which sorting algorithm has guaranteed O(n log n) worst-case time?",
      options: ["Bubble sort", "Insertion sort", "Merge sort", "Selection sort"],
      correctIndex: 2
    }
  ],
  "Amazon-style problem solving": [
    {
      question: "You need the k largest values from a very large stream. Which approach uses O(k) memory?",
      options: ["Keep a min-heap of size k", "Sort the entire stream repeatedly", "Keep a max-heap of every value", "Use a stack of all values"],
      correctIndex: 0
    },
    {
      question: "Which data structure best supports average O(1) lookup by key?",
      options: ["Hash map", "Unsorted linked list", "Binary tree without ordering", "Queue"],
      correctIndex: 0
    },
    {
      question: "Which approach is best for validating balanced parentheses in a string?",
      options: ["Track opening brackets with a stack", "Sort the characters", "Use binary search", "Count only total bracket characters"],
      correctIndex: 0
    },
    {
      question: "What is the average time complexity to build a heap from n items using bottom-up heapify?",
      options: ["O(1)", "O(log n)", "O(n)", "O(n log n)"],
      correctIndex: 2
    },
    {
      question: "To find the shortest number of moves in a grid where each move has equal cost, which search is usually appropriate?",
      options: ["Breadth-first search", "Depth-first search", "Quick sort", "Binary search on cells"],
      correctIndex: 0
    },
    {
      question: "A function checks every pair in a list of n items. What is its time complexity?",
      options: ["O(log n)", "O(n)", "O(n log n)", "O(n²)"],
      correctIndex: 3
    }
  ],
  "Data structures & algorithms": [
    {
      question: "What is the time complexity of inserting at the head of a singly linked list when the head pointer is known?",
      options: ["O(1)", "O(log n)", "O(n)", "O(n²)"],
      correctIndex: 0
    },
    {
      question: "Which traversal of a binary search tree returns values in sorted order?",
      options: ["Pre-order", "In-order", "Post-order", "Level-order only"],
      correctIndex: 1
    },
    {
      question: "What is the space complexity of an iterative depth-first search using an explicit stack, in the worst case?",
      options: ["O(1)", "O(log n) always", "O(V)", "O(V²)"],
      correctIndex: 2
    },
    {
      question: "Which algorithm is commonly used to find a minimum spanning tree?",
      options: ["Kruskal's algorithm", "Binary search", "Boyer–Moore string search", "Floyd–Warshall only"],
      correctIndex: 0
    },
    {
      question: "When is dynamic programming a natural fit?",
      options: ["When a problem has overlapping subproblems and optimal substructure", "Whenever input is sorted", "Only for graph problems", "When no state can be reused"],
      correctIndex: 0
    },
    {
      question: "What is the worst-case lookup time in an unbalanced binary search tree with n nodes?",
      options: ["O(1)", "O(log n)", "O(n)", "O(n log n)"],
      correctIndex: 2
    }
  ],
  "SQL & data interview": [
    {
      question: "Which query returns departments with more than five employees?",
      options: ["SELECT department FROM staff WHERE COUNT(*) > 5 GROUP BY department", "SELECT department FROM staff GROUP BY department HAVING COUNT(*) > 5", "SELECT department FROM staff ORDER BY COUNT(*) > 5", "SELECT COUNT(department) FROM staff WHERE > 5"],
      correctIndex: 1
    },
    {
      question: "Which join keeps every row from the left table, even when there is no match on the right?",
      options: ["INNER JOIN", "LEFT JOIN", "CROSS JOIN", "SELF JOIN"],
      correctIndex: 1
    },
    {
      question: "What does `COUNT(column_name)` normally exclude?",
      options: ["Duplicate values", "NULL values", "Negative values", "Text values"],
      correctIndex: 1
    },
    {
      question: "Which SQL feature assigns a rank to rows within each department?",
      options: ["GROUP BY only", "Window function with PARTITION BY", "DISTINCT only", "Foreign key"],
      correctIndex: 1
    },
    {
      question: "Why add an index to a frequently filtered database column?",
      options: ["It can speed up lookups, with storage and write costs", "It guarantees duplicate rows disappear", "It always makes every query faster", "It replaces data validation"],
      correctIndex: 0
    },
    {
      question: "Which clause sorts query results?",
      options: ["GROUP BY", "ORDER BY", "HAVING", "UNION"],
      correctIndex: 1
    },
    {
      question: "Which clause filters rows before grouping and aggregation?",
      options: ["HAVING", "WHERE", "ORDER BY", "LIMIT"],
      correctIndex: 1
    },
    {
      question: "A query needs the previous row's value without joining the table to itself. Which SQL feature fits?",
      options: ["A window function such as LAG()", "DISTINCT", "A CHECK constraint", "TRUNCATE"],
      correctIndex: 0
    }
  ]
};

const HR_QUESTIONS = [
  {
    question: "Tell me about yourself.",
    tip: "Model answer tip: keep it under a minute — briefly cover your academic background, 1-2 relevant projects or skills, and why you're interested in this kind of internship."
  },
  {
    question: "Why do you want this internship?",
    tip: "Model answer tip: connect something specific about the role or company to a skill or interest you already have — avoid generic answers like 'to gain experience'."
  },
  {
    question: "Describe a challenge you faced in a project and how you handled it.",
    tip: "Model answer tip: use a brief STAR structure — Situation, Task, Action, Result — and end with what you learned."
  },
  {
    question: "What are your strengths and weaknesses?",
    tip: "Model answer tip: pick a real weakness and describe a concrete step you're taking to improve it, rather than a disguised strength."
  },
  {
    question: "Where do you see yourself in the next few years?",
    tip: "Model answer tip: tie your answer to skills and domains you want to grow in, connected loosely to the kind of role you're applying for."
  },
  {
    question: "Do you have any questions for us?",
    tip: "Model answer tip: always ask something — about the team's day-to-day work, how success is measured, or what a typical project looks like."
  }
];

if (typeof module !== "undefined" && module.exports) {
  module.exports = { INTERVIEW_QUESTIONS, HR_QUESTIONS };
}
