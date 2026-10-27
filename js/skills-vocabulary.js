/* js/skills-vocabulary.js
   Flat list of skill terms the chatbot and resume analyzer scan for.
   Kept separate from data/internships.js so it can include synonyms/casing
   variants that don't need to exist on any single listing. */

const SKILLS_VOCABULARY = [
  "Python", "Java", "JavaScript", "TypeScript", "C++", "C", "SQL", "HTML", "CSS",
  "React", "Node.js", "Angular", "Vue", "Django", "Flask",
  "Machine Learning", "Deep Learning", "NLP", "TensorFlow", "PyTorch", "Scikit-learn",
  "Data Analysis", "Data Visualization", "Data Structures", "Statistics", "Excel", "Power BI",
  "Cloud Computing", "AWS", "Azure", "GCP", "Linux", "Networking", "Docker", "Kubernetes",
  "System Design", "Problem Solving", "Research", "Communication", "Content Writing",
  "SEO", "Social Media", "Analytics", "Financial Modeling", "Accounting",
  "AutoCAD", "SolidWorks", "Quality Control", "Electrical Systems",
  "Troubleshooting", "Project Management", "Product Management"
];

const SECTOR_VOCABULARY = [
  "Information Technology", "Software Development", "Data Analytics",
  "Artificial Intelligence", "Finance", "Marketing", "Manufacturing",
  "Renewable Energy", "Healthcare"
];

if (typeof module !== "undefined" && module.exports) {
  module.exports = { SKILLS_VOCABULARY, SECTOR_VOCABULARY };
}
