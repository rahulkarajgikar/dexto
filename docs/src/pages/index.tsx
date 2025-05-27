import React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import CTASection from '@site/src/components/CTASection';
import Heading from '@theme/Heading';

import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <div className={styles.heroContent}>
          <div className={styles.heroText}>
            <Heading as="h1" className={styles.heroTitle}>
              Build AI Agents with <span className={styles.gradient}>Saiki</span>
            </Heading>
            <p className={styles.heroSubtitle}>
              An open-source, modular and extensible framework that lets you build AI Agents and AI powered applications seamlessly.
            </p>
            <div className={styles.buttons}>
              <Link
                className={clsx('button button--secondary button--lg', styles.getStartedButton)}
                to="/docs/getting-started/intro">
                Get Started
              </Link>
              <Link
                className={clsx('button button--outline button--lg', styles.githubButton)}
                to="https://github.com/truffle-ai/saiki">
                View on GitHub
              </Link>
            </div>
          </div>
          <div className={styles.heroVisual}>
            <div className={styles.codeBlock}>
              <div className={styles.codeHeader}>
                <div className={styles.codeDots}>
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <span className={styles.codeTitle}>Terminal</span>
              </div>
              <div className={styles.codeContent}>
                <pre className={styles.terminalCode}>
{`$ npm install -g @truffle-ai/saiki
✓ Installed successfully!

$ saiki
✨ Starting Saiki CLI...
🤖 How can I help you today?

> find all .js files in this directory
📁 Found 12 JavaScript files:
   - src/index.js
   - src/utils.js
   - tests/app.test.js
   ...

$ saiki --mode web
🌐 Starting Web UI at http://localhost:3000

$ saiki --mode discord
🤖 Discord bot is now online!`}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className={styles.heroBackground}>
        <div className={styles.gridPattern}></div>
        <div className={styles.gradientOrb1}></div>
        <div className={styles.gradientOrb2}></div>
        <div className={styles.gradientOrb3}></div>
      </div>
    </header>
  );
}

function QuickStartSection() {
  return (
    <section className={styles.quickStartSection}>
      <div className="container">
        <div className={styles.quickStartContent}>
          <div className={styles.quickStartHeader}>
            <Heading as="h2" className={styles.quickStartTitle}>
              Two Ways to Build with Saiki
            </Heading>
            <p className={styles.quickStartSubtitle}>
              Use the CLI for quick interactions or the programmatic API for building applications
            </p>
          </div>
          
          <div className={styles.quickStartGrid}>
            <div className={styles.quickStartCard}>
              <div className={styles.cardHeader}>
                <h3>🚀 CLI Mode</h3>
                <p>Perfect for quick tasks and automation</p>
              </div>
              <div className={styles.codeExample}>
                <div className={styles.codeHeader}>
                  <div className={styles.codeDots}>
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <span className={styles.codeTitle}>Terminal</span>
                </div>
                <div className={styles.codeContent}>
                  <pre className={styles.terminalText}>
{`# Install globally
$ npm install -g @truffle-ai/saiki

# Start interactive CLI
$ saiki
🤖 How can I help you today?

# One-shot commands
$ saiki find all .js files
$ saiki --mode web
$ saiki --mode discord`}
                  </pre>
                </div>
              </div>
            </div>

            <div className={styles.quickStartCard}>
              <div className={styles.cardHeader}>
                <h3>⚡ Programmatic API</h3>
                <p>Build custom applications and integrations</p>
              </div>
              <div className={styles.codeExample}>
                <div className={styles.codeHeader}>
                  <div className={styles.codeDots}>
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <span className={styles.codeTitle}>my-agent.ts</span>
                </div>
                <div className={styles.codeContent}>
                  <pre>
{`import { createSaikiAgent } from '@truffle-ai/saiki';

const agent = await createSaikiAgent({
  llm: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    apiKey: process.env.OPENAI_API_KEY
  },
  mcpServers: {
    filesystem: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '.']
    }
  }
});

const response = await agent.run('Hello!');`}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Home(): React.ReactElement {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title} - Build AI Agents with ease`}
      description="An open-source, modular and extensible framework for building AI Agents and AI powered applications">
      <HomepageHeader />
      <main>
        <QuickStartSection />
        <HomepageFeatures />
        <CTASection />
      </main>
    </Layout>
  );
}
