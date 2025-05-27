import React from 'react';
import Link from '@docusaurus/Link';
import clsx from 'clsx';
import styles from './styles.module.css';

export default function CTASection(): React.ReactElement {
  return (
    <section className={styles.ctaSection}>
      <div className="container">
        <div className={styles.ctaContent}>
          <h2 className={styles.ctaTitle}>
            Ready to build your first AI agent?
          </h2>
          <p className={styles.ctaDescription}>
            Get started with Saiki in minutes. Install the framework, configure your agent, and start building intelligent applications.
          </p>
          <div className={styles.ctaButtons}>
            <Link
              className={clsx('button button--primary button--lg', styles.primaryButton)}
              to="/docs/getting-started/intro">
              Get Started Now
            </Link>
            <Link
              className={clsx('button button--outline button--lg', styles.secondaryButton)}
              to="https://github.com/truffle-ai/saiki">
              View Examples
            </Link>
          </div>
          <div className={styles.installCommand}>
            <div className={styles.commandBox}>
              <span className={styles.commandPrompt}>$</span>
              <span className={styles.commandText}>npm install -g @truffle-ai/saiki</span>
            </div>
          </div>
        </div>
      </div>
      <div className={styles.ctaBackground}>
        <div className={styles.gradientOrb1}></div>
        <div className={styles.gradientOrb2}></div>
      </div>
    </section>
  );
} 