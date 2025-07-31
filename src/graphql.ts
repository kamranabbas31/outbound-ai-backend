
/*
 * -------------------------------------------------------
 * THIS FILE WAS AUTOMATICALLY GENERATED (DO NOT MODIFY)
 * -------------------------------------------------------
 */

/* tslint:disable */
/* eslint-disable */

export interface RegisterInput {
    username: string;
    email: string;
    password: string;
}

export interface LoginInput {
    username: string;
    password: string;
}

export interface TriggerCallInput {
    leadId: string;
    assistantId?: Nullable<string>;
}

export interface LeadInput {
    name?: Nullable<string>;
    phone_number: string;
    phone_id?: Nullable<string>;
    status?: Nullable<string>;
    disposition?: Nullable<string>;
    duration?: Nullable<number>;
    cost?: Nullable<number>;
    recordingUrl?: Nullable<string>;
    initiated?: Nullable<boolean>;
}

export interface CreateUserInput {
    username: string;
    email: string;
    password: string;
}

export interface AuthPayload {
    accessToken: string;
}

export interface LoginPayload {
    accessToken: string;
    user: User;
}

export interface RegisterResponse {
    message: string;
    user: User;
}

export interface User {
    id: string;
    username: string;
    email: string;
}

export interface IMutation {
    register(data: RegisterInput): RegisterResponse | Promise<RegisterResponse>;
    login(data: LoginInput): LoginPayload | Promise<LoginPayload>;
    refresh(): AuthPayload | Promise<AuthPayload>;
    triggerCall(input: TriggerCallInput): TriggerCallResponse | Promise<TriggerCallResponse>;
    createCampaign(campaignName: string, userId: string): CampaignResponse | Promise<CampaignResponse>;
    addLeadsToCampaign(campaignId: string, leads: LeadInput[]): CampaignResponse | Promise<CampaignResponse>;
    enqueueCampaignJob(campaignId: string, pacingPerSecond?: Nullable<number>): QueueResponse | Promise<QueueResponse>;
    stopCampaignJob(campaignId: string): QueueResponse | Promise<QueueResponse>;
    createUser(data: CreateUserInput): User | Promise<User>;
}

export interface BillingStats {
    totalCalls: number;
    totalMinutes: number;
    totalCost: number;
}

export interface BillingStatsResponse {
    userError?: Nullable<UserError>;
    data?: Nullable<BillingStats>;
}

export interface IQuery {
    fetchBillingData(userId: string, start: string, end: string): BillingStatsResponse | Promise<BillingStatsResponse>;
    fetchCampaigns(userId: string): CampaignListResponse | Promise<CampaignListResponse>;
    fetchLeadsForCampaign(campaignId: string, skip?: Nullable<number>, take?: Nullable<number>, searchTerm?: Nullable<string>): LeadListResponse | Promise<LeadListResponse>;
    fetchCampaignById(campaignId: string): CampaignResponse | Promise<CampaignResponse>;
    fetchCampaignStats(campaignId: string): CampaignStatsResponse | Promise<CampaignStatsResponse>;
    getTotalPagesForCampaign(campaignId: string, itemsPerPage?: Nullable<number>): CampaignLeadPaginationResult | Promise<CampaignLeadPaginationResult>;
    getMultipleAvailablePhoneIds(count: number): string[] | Promise<string[]>;
    getUser(id: string): Nullable<User> | Promise<Nullable<User>>;
}

export interface TriggerCallResponse {
    success: boolean;
    message: string;
    data?: Nullable<JSON>;
}

export interface Campaign {
    id: string;
    name: string;
    file_name?: Nullable<string>;
    status?: Nullable<string>;
    execution_status?: Nullable<string>;
    leads_count?: Nullable<number>;
    completed?: Nullable<number>;
    in_progress?: Nullable<number>;
    remaining?: Nullable<number>;
    failed?: Nullable<number>;
    duration?: Nullable<number>;
    cost?: Nullable<number>;
    user_id?: Nullable<string>;
    created_at?: Nullable<string>;
}

export interface Lead {
    id: string;
    name?: Nullable<string>;
    phone_number?: Nullable<string>;
    phone_id?: Nullable<string>;
    status?: Nullable<string>;
    disposition?: Nullable<string>;
    duration?: Nullable<number>;
    cost?: Nullable<number>;
    recordingUrl?: Nullable<string>;
    created_at?: Nullable<string>;
    campaign_id?: Nullable<string>;
    initiated?: Nullable<boolean>;
}

export interface CampaignResponse {
    userError?: Nullable<UserError>;
    data?: Nullable<Campaign>;
}

export interface CampaignListResponse {
    userError?: Nullable<UserError>;
    data?: Nullable<Campaign[]>;
}

export interface LeadListResponse {
    userError?: Nullable<UserError>;
    data?: Nullable<Lead[]>;
}

export interface UserError {
    message?: Nullable<string>;
}

export interface CampaignStats {
    completed?: Nullable<number>;
    inProgress?: Nullable<number>;
    remaining?: Nullable<number>;
    failed?: Nullable<number>;
    totalDuration?: Nullable<number>;
    totalCost?: Nullable<number>;
}

export interface CampaignStatsResponse {
    userError?: Nullable<UserError>;
    data?: Nullable<CampaignStats>;
}

export interface QueueResponse {
    userError?: Nullable<UserError>;
    success?: Nullable<boolean>;
}

export interface CampaignLeadPaginationResult {
    userError?: Nullable<UserError>;
    totalPages?: Nullable<number>;
    totalLeads?: Nullable<number>;
}

export type JSON = any;
type Nullable<T> = T | null;
