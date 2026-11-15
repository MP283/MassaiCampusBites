'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { homeFor, useAuth } from '@/lib/auth';

const FEATURES = [
  { icon: '📄', title: 'Upload any material', text: 'PDFs, notes, or photos of textbook pages. Text is extracted automatically with OCR.' },
  { icon: '🤖', title: 'AI-written questions', text: 'Gemini creates MCQs, fill-in-the-blanks, matching, short and long questions from your content.' },
  { icon: '⏱️', title: 'Exam-style online tests', text: 'Timed tests with a question palette, mark-for-review and auto-submit, like government exams.' },
  { icon: '🖨️', title: 'Branded PDF papers', text: 'Download print-ready papers with your institute logo for offline exams, then grade uploaded answer sheets.' },
  { icon: '✅', title: 'Instant grading', text: 'Objective answers are graded instantly; written answers are graded by AI with teacher override.' },
  { icon: '📊', title: 'Analytics for everyone', text: 'Students see their strengths and weak topics; admins see class-wide performance at a glance.' },
];

export default function Landing() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && user) router.replace(homeFor(user));
  }, [user, loading, router]);

  return (
    <div>
      <nav className="landing-nav">
        <div className="brand" style={{ padding: 0 }}>
          <span className="brand-mark">AI</span> TestGen
        </div>
        <div className="row">
          <Link className="btn btn-ghost" href="/login">
            Log in
          </Link>
          <Link className="btn" href="/register">
            Get started
          </Link>
        </div>
      </nav>
      <section className="hero">
        <div>
          <span className="badge badge-primary mb">For schools, coaching centres &amp; self-learners</span>
          <h1>
            Turn study material into <span>ready-to-take tests</span> in minutes
          </h1>
          <p className="lead">
            Upload your notes, choose the marks, sections and question types, and let AI write the paper. Students take it
            online or on paper, and everyone gets instant, detailed feedback.
          </p>
          <div className="row">
            <Link className="btn btn-lg" href="/register">
              Create an admin account
            </Link>
            <Link className="btn btn-outline btn-lg" href="/login">
              Student login
            </Link>
          </div>
          <p className="small muted mt">
            Demo: <code>admin@demo.com</code> / <code>student@demo.com</code>, password <code>password123</code>
          </p>
        </div>
        <div className="card" style={{ padding: 24 }}>
          <div className="row mb">
            <span className="badge badge-ok">Section A · Objective</span>
            <span className="spacer" />
            <span className="timer">18:42</span>
          </div>
          <p className="question-text">Q3. Which pigment in leaves absorbs light energy for photosynthesis?</p>
          {['Carotene', 'Chlorophyll', 'Xanthophyll', 'Melanin'].map((o, i) => (
            <div key={o} className={`option ${i === 1 ? 'selected' : ''}`}>
              <span className="option-letter">{String.fromCharCode(65 + i)}</span>
              {o}
            </div>
          ))}
        </div>
      </section>
      <section className="features">
        <div className="grid grid-3">
          {FEATURES.map((f) => (
            <div className="card" key={f.title}>
              <div className="feature-icon" aria-hidden>
                {f.icon}
              </div>
              <h3>{f.title}</h3>
              <p className="muted" style={{ margin: 0 }}>
                {f.text}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
