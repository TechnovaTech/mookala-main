/**
 * Importing this file registers the server-side hooks for every resource.
 * It is imported by the generic resource API routes only, never by the browser.
 */
import './learning.hooks';
import './wishes.hooks';
import './advertising.hooks';
import './memberships.hooks';
import './marketing.hooks';
import './communications.hooks';
import './legal.hooks';
import './fraud.hooks';
import './system.hooks';
import './finance.hooks';
import './catalogue.hooks';
import './artists.hooks';
import './reports.hooks';

export {};
