import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  icon: string;
  description: ReactNode;
  highlights: string[];
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Customizable, Config-Driven Agents',
    icon: '🤖',
    description: (
      <>
        Create a Saiki agent by creating one config file. Configure your tools, LLM 
        configuration, prompts, context management strategies in one file and re-use that anywhere.
      </>
    ),
    highlights: ['One config file', 'Multiple LLM providers', 'Reusable configurations']
  },
  {
    title: 'Feature-rich Developer Tools',
    icon: '🛠️',
    description: (
      <>
        Saiki has a powerful CLI and web UI playground you can use to build, test and experiment with 
        different AI agents.
      </>
    ),
    highlights: ['Interactive CLI', 'Web playground', 'Real-time testing']
  },
  {
    title: 'First-class MCP Support',
    icon: '🔌',
    description: (
      <>
        Connect Saiki agents to remote and local MCP servers to enhance their functionality.
      </>
    ),
    highlights: ['MCP integration', 'Extensible tools', 'Rich ecosystem']
  },
  {
    title: 'Multi-LLM Support',
    icon: '🧠',
    description: (
      <>
        Saiki supports OpenAI, Anthropic, Google and Groq LLMs. Saiki is open 
        source and makes it extremely easy to build your own APIs as well.
      </>
    ),
    highlights: ['Multiple providers', 'Easy integration', 'Custom APIs']
  },
  {
    title: 'Access Saiki Agents in Any Application',
    icon: '🚀',
    description: (
      <>
        Saiki agents can be used on telegram, discord, slack, and even as their own MCP servers 
        - all out of the box! Saiki agents can even be used in your custom applications!
      </>
    ),
    highlights: ['Platform agnostic', 'Multiple channels', 'MCP server mode']
  },
  {
    title: 'In-built Context Management',
    icon: '💾',
    description: (
      <>
        Saiki agents have in-built context management to handle the token limits of LLMs. Even this is 
        customizable!
      </>
    ),
    highlights: ['Smart context handling', 'Token optimization', 'Fully customizable']
  },
];

function Feature({title, icon, description, highlights}: FeatureItem) {
  return (
    <div className={clsx('col col--4', styles.feature)}>
      <div className={styles.featureCard}>
        <div className={styles.featureIcon}>
          <span className={styles.iconEmoji}>{icon}</span>
        </div>
        <div className={styles.featureContent}>
          <Heading as="h3" className={styles.featureTitle}>{title}</Heading>
          <p className={styles.featureDescription}>{description}</p>
          <ul className={styles.featureHighlights}>
            {highlights.map((highlight, idx) => (
              <li key={idx} className={styles.highlight}>
                <span className={styles.checkmark}>✓</span>
                {highlight}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className={styles.featuresHeader}>
          <Heading as="h2" className={styles.featuresTitle}>
            Why developers choose Saiki
          </Heading>
          <p className={styles.featuresSubtitle}>
            Saiki is the missing natural language layer across your stack. Its powerful in-built features and high customizability means that 
            whether you're automating workflows, building agents, or prototyping new ideas, Saiki gives you the tools to move fast — and bend 
            it to your needs.
          </p>
        </div>
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
