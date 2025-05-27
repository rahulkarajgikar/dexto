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
                <span className={styles.codeTitle}>my-agent.ts</span>
              </div>
              <div className={styles.codeContent}>
                <pre>
{`import { createSaikiAgent } from '@truffle-ai/saiki';

const agentConfig = {
  llm: {
    provider: 'openai',
    model: 'gpt-4.1-mini',
    apiKey: process.env.OPENAI_API_KEY,
    systemPrompt: 'You are a helpful AI assistant with access to tools.'
  },
  mcpServers: {
    filesystem: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '.']
    }
  }
};

const agent = await createSaikiAgent(agentConfig);
const response = await agent.run('Hello, how can you help me?');`}
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

export default function Home(): React.ReactElement {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title} - Build AI Agents with ease`}
      description="An open-source, modular and extensible framework for building AI Agents and AI powered applications">
      <HomepageHeader />
      <main>
        <HomepageFeatures />
        <CTASection />
      </main>
    </Layout>
  );
}
