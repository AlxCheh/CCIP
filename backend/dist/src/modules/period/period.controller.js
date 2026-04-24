"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PeriodController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const roles_guard_1 = require("../../common/guards/roles.guard");
const roles_decorator_1 = require("../../common/guards/roles.decorator");
const period_service_1 = require("./period.service");
const open_period_dto_1 = require("./dto/open-period.dto");
let PeriodController = class PeriodController {
    periodService;
    constructor(periodService) {
        this.periodService = periodService;
    }
    open(dto, req) {
        return this.periodService.openPeriod(dto.objectId, req.user.id);
    }
    close(id, req) {
        return this.periodService.closePeriod(id, req.user.id);
    }
    byObject(objectId) {
        return this.periodService.findByObject(objectId);
    }
};
exports.PeriodController = PeriodController;
__decorate([
    (0, common_1.Post)('open'),
    (0, roles_decorator_1.Roles)('sc', 'admin'),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [open_period_dto_1.OpenPeriodDto, Object]),
    __metadata("design:returntype", void 0)
], PeriodController.prototype, "open", null);
__decorate([
    (0, common_1.Patch)(':id/close'),
    (0, roles_decorator_1.Roles)('sc', 'admin'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PeriodController.prototype, "close", null);
__decorate([
    (0, common_1.Get)('by-object/:objectId'),
    (0, roles_decorator_1.Roles)('director', 'sc', 'gp', 'admin'),
    __param(0, (0, common_1.Param)('objectId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], PeriodController.prototype, "byObject", null);
exports.PeriodController = PeriodController = __decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)('periods'),
    __metadata("design:paramtypes", [period_service_1.PeriodService])
], PeriodController);
//# sourceMappingURL=period.controller.js.map