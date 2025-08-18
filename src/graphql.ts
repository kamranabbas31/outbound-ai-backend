
/*
 * -------------------------------------------------------
 * THIS FILE WAS AUTOMATICALLY GENERATED (DO NOT MODIFY)
 * -------------------------------------------------------
 */

/* tslint:disable */
/* eslint-disable */

export enum ActivityType {
    CALL_ATTEMPT = "CALL_ATTEMPT",
    DISPOSITION_TRANSITION = "DISPOSITION_TRANSITION",
    CADENCE_EXECUTION = "CADENCE_EXECUTION",
    NOTE_ADDED = "NOTE_ADDED",
    STATUS_UPDATE = "STATUS_UPDATE"
}

export interface LeadActivityLogFilterInput {
    lead_id?: Nullable<string>;
    campaign_id?: Nullable<string>;
    activity_type?: Nullable<ActivityType>;
}

export interface RegisterInput {
    username: string;
    email: string;
    password: string;
}

export interface LoginInput {
    username: string;
    password: string;
}

export interface CadenceDayInput {
    attempts: number;
    time_windows: string[];
}

export interface CadenceDaysInput {
    day: string;
    config: CadenceDayInput;
}

export interface CreateCadenceTemplateInput {
    name: string;
    retry_dispositions: string[];
    cadence_days: CadenceDaysInput[];
}

export interface UpdateCadenceTemplateInput {
    id: string;
    name?: Nullable<string>;
    retry_dispositions?: Nullable<string[]>;
    cadence_days?: Nullable<CadenceDaysInput[]>;
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

export interface AttachCadenceInput {
    campaignId: string;
    cadenceId: string;
    startDate?: Nullable<DateTime>;
}

export interface UpdateCampaignInput {
    id: string;
    name?: Nullable<string>;
    file_name?: Nullable<string>;
    status?: Nullable<string>;
    leads_count?: Nullable<number>;
    completed?: Nullable<number>;
    in_progress?: Nullable<number>;
    remaining?: Nullable<number>;
    failed?: Nullable<number>;
    duration?: Nullable<number>;
    cost?: Nullable<number>;
    execution_status?: Nullable<string>;
    cadence_template_id?: Nullable<string>;
    cadence_start_date?: Nullable<DateTime>;
    cadence_stopped?: Nullable<boolean>;
    cadence_completed?: Nullable<boolean>;
}

export interface CreateUserInput {
    username: string;
    email: string;
    password: string;
}

export interface LeadActivityLog {
    id: string;
    lead_id: string;
    campaign_id: string;
    activity_type: ActivityType;
    from_disposition?: Nullable<string>;
    to_disposition?: Nullable<string>;
    disposition_at?: Nullable<string>;
    duration?: Nullable<number>;
    cost?: Nullable<number>;
    created_at: string;
}

export interface LeadActivityLogResponse {
    userError?: Nullable<UserError>;
    data?: Nullable<LeadActivityLog[]>;
}

export interface UserError {
    message: string;
}

export interface IQuery {
    leadActivityLogs(filter: LeadActivityLogFilterInput): LeadActivityLogResponse | Promise<LeadActivityLogResponse>;
    fetchBillingData(userId: string, start: string, end: string): BillingStatsResponse | Promise<BillingStatsResponse>;
    cadenceTemplates(): CadenceTemplatesResponse | Promise<CadenceTemplatesResponse>;
    fetchCampaigns(userId: string): CampaignListResponse | Promise<CampaignListResponse>;
    fetchLeadsForCampaign(campaignId: string, skip?: Nullable<number>, take?: Nullable<number>, searchTerm?: Nullable<string>): LeadListResponse | Promise<LeadListResponse>;
    fetchCampaignById(campaignId: string): CampaignResponse | Promise<CampaignResponse>;
    fetchCampaignStats(campaignId: string): CampaignStatsResponse | Promise<CampaignStatsResponse>;
    getTotalPagesForCampaign(campaignId: string, itemsPerPage?: Nullable<number>): CampaignLeadPaginationResult | Promise<CampaignLeadPaginationResult>;
    fetchLeadAttempts(campaignId: string): LeadAttemptListResponse | Promise<LeadAttemptListResponse>;
    fetchDashboardStats(userId: string, startDate?: Nullable<string>, endDate?: Nullable<string>): DashboardStatsResponse | Promise<DashboardStatsResponse>;
    getMultipleAvailablePhoneIds(count: number): string[] | Promise<string[]>;
    getUser(id: string): Nullable<User> | Promise<Nullable<User>>;
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
    createCadenceTemplate(input: CreateCadenceTemplateInput): CreateCadenceTemplateResponse | Promise<CreateCadenceTemplateResponse>;
    updateCadenceTemplate(input: UpdateCadenceTemplateInput): UpdateCadenceTemplateResponse | Promise<UpdateCadenceTemplateResponse>;
    deleteCadenceTemplate(id: string): DeleteCadenceTemplateResponse | Promise<DeleteCadenceTemplateResponse>;
    triggerCall(input: TriggerCallInput): TriggerCallResponse | Promise<TriggerCallResponse>;
    createCampaign(campaignName: string, userId: string): CampaignResponse | Promise<CampaignResponse>;
    addLeadsToCampaign(campaignId: string, leads: LeadInput[], cadenceId?: Nullable<string>, cadenceStartDate?: Nullable<DateTime>): CampaignResponse | Promise<CampaignResponse>;
    enqueueCampaignJob(campaignId: string, pacingPerSecond?: Nullable<number>): QueueResponse | Promise<QueueResponse>;
    stopCampaignJob(campaignId: string): QueueResponse | Promise<QueueResponse>;
    attachCadenceToCampaign(input: AttachCadenceInput): CadenceAttachResponse | Promise<CadenceAttachResponse>;
    stopCadence(campaignId: string): CadenceAttachResponse | Promise<CadenceAttachResponse>;
    updateCampaign(input: UpdateCampaignInput): UpdateCampaignResponse | Promise<UpdateCampaignResponse>;
    createPhoneIds(phoneIds: string[]): boolean | Promise<boolean>;
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
    cadence_template?: Nullable<CadenceTemplate>;
    cadence_template_id?: Nullable<string>;
    cadence_start_date?: Nullable<DateTime>;
    cadence_stopped?: Nullable<boolean>;
    cadence_completed?: Nullable<boolean>;
    cadence_progress?: Nullable<Nullable<CadenceProgress>[]>;
}

export interface CadenceTemplate {
    id: string;
    name: string;
    retry_dispositions: string[];
    cadence_days: JSON;
    created_at: DateTime;
    campaigns: Campaign[];
}

export interface CreateCadenceTemplateResponse {
    userError?: Nullable<UserError>;
    template?: Nullable<CadenceTemplate>;
}

export interface UpdateCadenceTemplateResponse {
    userError?: Nullable<UserError>;
    template?: Nullable<CadenceTemplate>;
}

export interface CadenceTemplatesResponse {
    userError?: Nullable<UserError>;
    templates?: Nullable<CadenceTemplate[]>;
}

export interface DeleteCadenceTemplateResponse {
    userError?: Nullable<UserError>;
    success: boolean;
}

export interface TriggerCallResponse {
    success: boolean;
    message: string;
    data?: Nullable<JSON>;
}

export interface CadenceProgress {
    id: string;
    day: number;
    attempt: number;
    executed_at: string;
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
    initiated_at?: Nullable<string>;
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

export interface CadenceAttachResponse {
    success?: Nullable<boolean>;
    userError?: Nullable<UserError>;
}

export interface UpdateCampaignResponse {
    success: boolean;
    userError?: Nullable<UserError>;
    campaign?: Nullable<Campaign>;
}

export interface LeadAttempt {
    name?: Nullable<string>;
    phone?: Nullable<string>;
    status?: Nullable<string>;
    disposition?: Nullable<string>;
    duration?: Nullable<string>;
    cost?: Nullable<number>;
    attempt?: Nullable<number>;
}

export interface LeadAttemptListResponse {
    userError?: Nullable<UserError>;
    data?: Nullable<LeadAttempt[]>;
}

export interface DashboardStats {
    completed: number;
    inProgress: number;
    remaining: number;
    failed: number;
    totalDuration: number;
    totalCost: number;
}

export interface DashboardStatsResponse {
    userError?: Nullable<UserError>;
    data?: Nullable<DashboardStats>;
}

export type JSON = any;
export type DateTime = any;
type Nullable<T> = T | null;
