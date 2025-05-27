import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
    title: 'Saiki',
    tagline: 'Build AI Agents with ease',
    favicon: 'img/favicon.ico',

    // Set the production url of your site here
    url: 'https://truffle-ai.github.io',
    // Set the /<baseUrl>/ pathname under which your site is served
    // For GitHub pages deployment, it is often '/<projectName>/'
    baseUrl: '/saiki/',

    // GitHub pages deployment config.
    // If you aren't using GitHub pages, you don't need these.
    organizationName: 'truffle-ai', // Usually your GitHub org/user name.
    projectName: 'saiki', // Usually your repo name.

    onBrokenLinks: 'throw',
    onBrokenMarkdownLinks: 'warn',

    // Even if you don't use internationalization, you can use this field to set
    // useful metadata like html lang. For example, if your site is Chinese, you
    // may want to replace "en" with "zh-Hans".
    i18n: {
        defaultLocale: 'en',
        locales: ['en'],
    },

    presets: [
        [
            'classic',
            {
                docs: {
                    sidebarPath: './sidebars.ts',
                    // Please change this to your repo.
                    // Remove this to remove the "edit this page" links.
                    editUrl: 'https://github.com/truffle-ai/saiki/tree/main/docs/',
                    showLastUpdateAuthor: true,
                    showLastUpdateTime: true,
                },
                blog: {
                    showReadingTime: true,
                    feedOptions: {
                        type: ['rss', 'atom'],
                        xslt: true,
                    },
                    // Please change this to your repo.
                    // Remove this to remove the "edit this page" links.
                    editUrl: 'https://github.com/truffle-ai/saiki/tree/main/docs/',
                    // Useful options to enforce blogging best practices
                    onInlineTags: 'warn',
                    onInlineAuthors: 'warn',
                    onUntruncatedBlogPosts: 'warn',
                },
                theme: {
                    customCss: './src/css/custom.css',
                },
                sitemap: {
                    changefreq: 'weekly',
                    priority: 0.5,
                    ignorePatterns: ['/tags/**'],
                    filename: 'sitemap.xml',
                },
            } satisfies Preset.Options,
        ],
    ],

    themeConfig: {
        // Replace with your project's social card
        image: 'img/saiki-social-card.jpg',
        metadata: [
            {
                name: 'keywords',
                content:
                    'AI, agents, framework, LLM, artificial intelligence, automation, chatbots, MCP',
            },
            { name: 'twitter:card', content: 'summary_large_image' },
            { name: 'twitter:site', content: '@truffleai_' },
            { name: 'twitter:creator', content: '@truffleai_' },
            { property: 'og:type', content: 'website' },
            { property: 'og:site_name', content: 'Saiki' },
        ],
        navbar: {
            title: 'Saiki',
            logo: {
                alt: 'Saiki Logo',
                src: 'img/favicon.ico',
                width: 32,
                height: 32,
            },
            hideOnScroll: true,
            items: [
                {
                    type: 'docSidebar',
                    sidebarId: 'tutorialSidebar',
                    position: 'left',
                    label: 'Documentation',
                },
                {
                    to: '/blog',
                    label: 'Blog',
                    position: 'left',
                },
                {
                    type: 'search',
                    position: 'right',
                },
                {
                    href: 'https://github.com/truffle-ai/saiki',
                    position: 'right',
                    className: 'header-github-link',
                    'aria-label': 'GitHub repository',
                },
            ],
        },
        footer: {
            style: 'dark',
            links: [
                {
                    title: 'Documentation',
                    items: [
                        {
                            label: 'Getting Started',
                            to: '/docs/getting-started/intro',
                        },
                        {
                            label: 'User Guide',
                            to: '/docs/category/saiki-user-guide',
                        },
                        {
                            label: 'Configuration',
                            to: '/docs/category/configuration-guide',
                        },
                        {
                            label: 'Architecture',
                            to: '/docs/category/architecture',
                        },
                    ],
                },
                {
                    title: 'Community',
                    items: [
                        {
                            label: 'GitHub Issues',
                            href: 'https://github.com/truffle-ai/saiki/issues',
                        },
                        {
                            label: 'Discord',
                            href: 'https://discord.gg/GFzWFAAZcm',
                        },
                        {
                            label: 'X (Twitter)',
                            href: 'https://x.com/truffleai_',
                        },
                        {
                            label: 'Contributing',
                            to: '/docs/contribution-guide/overview',
                        },
                    ],
                },
                {
                    title: 'More',
                    items: [
                        {
                            label: 'Blog',
                            to: '/blog',
                        },
                        {
                            label: 'GitHub',
                            href: 'https://github.com/truffle-ai/saiki',
                        },
                        {
                            label: 'NPM Package',
                            href: 'https://www.npmjs.com/package/@truffle-ai/saiki',
                        },
                        {
                            label: 'Truffle AI',
                            href: 'https://truffle.ai',
                        },
                    ],
                },
            ],
            copyright: `Copyright © ${new Date().getFullYear()} Truffle AI. Built with Docusaurus.`,
        },
        prism: {
            theme: prismThemes.github,
            darkTheme: prismThemes.dracula,
            additionalLanguages: ['bash', 'json', 'yaml', 'typescript', 'javascript'],
        },
        colorMode: {
            defaultMode: 'light',
            disableSwitch: false,
            respectPrefersColorScheme: true,
        },
        docs: {
            sidebar: {
                hideable: true,
                autoCollapseCategories: true,
            },
        },
        announcementBar: {
            id: 'star-repo',
            content:
                '⭐️ If you like Saiki, give it a star on <a target="_blank" rel="noopener noreferrer" href="https://github.com/truffle-ai/saiki">GitHub</a>! ⭐️',
            backgroundColor: '#8b5cf6',
            textColor: '#ffffff',
            isCloseable: true,
        },
    } satisfies Preset.ThemeConfig,
};

export default config;
