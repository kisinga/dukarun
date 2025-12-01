import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

export interface SEOData {
    title?: string;
    description?: string;
    keywords?: string;
    image?: string;
    imageWidth?: number;
    imageHeight?: number;
    imageAlt?: string;
    url?: string;
    type?: string;
    locale?: string;
    siteName?: string;
    twitterCard?: string;
    twitterSite?: string;
}

@Injectable({
    providedIn: 'root',
})
export class SEOService {
    private readonly title = inject(Title);
    private readonly meta = inject(Meta);
    private readonly document = inject(DOCUMENT);

    /**
     * Get the base URL for absolute URLs
     */
    private getBaseUrl(): string {
        if (typeof window !== 'undefined') {
            return `${window.location.protocol}//${window.location.host}`;
        }
        return 'https://dukarun.com';
    }

    /**
     * Convert relative URL to absolute URL
     */
    private getAbsoluteUrl(url: string): string {
        if (!url) return '';
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return url;
        }
        const baseUrl = this.getBaseUrl();
        // Ensure URL starts with /
        const path = url.startsWith('/') ? url : `/${url}`;
        return `${baseUrl}${path}`;
    }

    private readonly defaultData: SEOData = {
        title: 'Dukarun - Point and Sell POS for Kenyan Businesses',
        description:
            'Point your phone at products and sell in seconds. Dukarun is the fastest POS system for Kenyan shops, dukas, and retail businesses. Works offline, accepts M-Pesa, and requires no training.',
        keywords:
            'POS system Kenya, point of sale Kenya, retail software Kenya, duka management, M-Pesa POS, offline POS Kenya, shop management Kenya, inventory management Kenya, barcode scanner Kenya',
        image: '/assets/logo/v3.png',
        imageWidth: 1200,
        imageHeight: 630,
        imageAlt: 'Dukarun - Point and Sell POS System for Kenyan Businesses',
        url: 'https://dukarun.com',
        type: 'website',
        locale: 'en_KE',
        siteName: 'Dukarun',
        twitterCard: 'summary_large_image',
        twitterSite: '@dukarun',
    };

    /**
     * Update SEO meta tags for the current page
     */
    updateTags(data: Partial<SEOData>): void {
        const seoData = { ...this.defaultData, ...data };

        // Convert image URL to absolute
        const absoluteImageUrl = this.getAbsoluteUrl(seoData.image || '');
        const absoluteUrl = seoData.url || this.getBaseUrl();

        // Update title
        if (seoData.title) {
            this.title.setTitle(seoData.title);
        }

        // Basic meta tags
        this.updateMetaTag('description', seoData.description || '');
        this.updateMetaTag('keywords', seoData.keywords || '');

        // Open Graph tags (Facebook, WhatsApp, LinkedIn)
        this.updateMetaTag('og:title', seoData.title || '');
        this.updateMetaTag('og:description', seoData.description || '');
        this.updateMetaTag('og:image', absoluteImageUrl);
        this.updateMetaTag('og:image:url', absoluteImageUrl);
        this.updateMetaTag('og:image:secure_url', absoluteImageUrl.replace('http://', 'https://'));
        if (seoData.imageWidth) {
            this.updateMetaTag('og:image:width', seoData.imageWidth.toString());
        }
        if (seoData.imageHeight) {
            this.updateMetaTag('og:image:height', seoData.imageHeight.toString());
        }
        if (seoData.imageAlt) {
            this.updateMetaTag('og:image:alt', seoData.imageAlt);
        }
        this.updateMetaTag('og:image:type', 'image/png');
        this.updateMetaTag('og:url', absoluteUrl);
        this.updateMetaTag('og:type', seoData.type || 'website');
        this.updateMetaTag('og:locale', seoData.locale || 'en_KE');
        this.updateMetaTag('og:site_name', seoData.siteName || '');

        // Twitter Card tags
        this.updateMetaTag('twitter:card', seoData.twitterCard || 'summary_large_image');
        this.updateMetaTag('twitter:title', seoData.title || '');
        this.updateMetaTag('twitter:description', seoData.description || '');
        this.updateMetaTag('twitter:image', absoluteImageUrl);
        this.updateMetaTag('twitter:image:alt', seoData.imageAlt || seoData.title || '');
        if (seoData.twitterSite) {
            this.updateMetaTag('twitter:site', seoData.twitterSite);
            this.updateMetaTag('twitter:creator', seoData.twitterSite);
        }

        // Additional SEO tags
        this.updateMetaTag('robots', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');
        this.updateMetaTag('googlebot', 'index, follow');
        this.updateMetaTag('geo.region', 'KE');
        this.updateMetaTag('geo.placename', 'Kenya');
    }

    /**
     * Update or create a meta tag
     */
    private updateMetaTag(name: string, content: string): void {
        if (!content) return;

        // For Open Graph and Twitter tags, use property attribute
        const isPropertyTag = name.startsWith('og:') || name.startsWith('twitter:');

        if (isPropertyTag) {
            // Check if property tag exists
            const existingTag = this.meta.getTag(`property="${name}"`);

            if (existingTag) {
                this.meta.updateTag({ property: name, content }, `property="${name}"`);
            } else {
                this.meta.addTag({ property: name, content });
            }
        } else {
            // For standard meta tags, use name attribute
            const existingTag = this.meta.getTag(`name="${name}"`);

            if (existingTag) {
                this.meta.updateTag({ name, content }, `name="${name}"`);
            } else {
                this.meta.addTag({ name, content });
            }
        }
    }

    /**
     * Reset to default SEO tags
     */
    resetToDefaults(): void {
        this.updateTags({});
    }
}

