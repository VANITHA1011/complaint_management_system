from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status

from django.conf import settings
from .models import (
    Complaint, ComplaintHistory,
    STATUS_PENDING, STATUS_IN_PROGRESS, STATUS_ESCALATED, STATUS_RESOLVED,
    LEVEL_ORDER,
)


def _serialize_complaint(c, request_level=None):
    # Get SLA minutes for the current level
    level_sla_map = {
        "ward": getattr(settings, "WARD_SLA_MINUTES", 5),
        "municipality": getattr(settings, "MUNICIPAL_SLA_MINUTES", 2),
        "district": getattr(settings, "DISTRICT_SLA_MINUTES", 3),
        "state": getattr(settings, "STATE_SLA_MINUTES", 10),
    }
    current_level_sla = level_sla_map.get(c.current_level, 2)
    
    data = {
        "id": c.id,
        "citizen_name": c.citizen_name,
        "title": c.title,
        "category": c.category,
        "description": c.description,
        "district": c.district,
        "area": c.area,
        "priority": c.priority,
        "current_level": c.current_level,
        "status": c.status,
        "created_at": c.created_at.isoformat(),
        "escalated_at": c.escalated_at.isoformat() if c.escalated_at else None,
        "escalation_reason": c.escalation_reason,
        "citizen_id": c.citizen_id,
        "is_editable": c.is_editable,
        # True only when complaint is currently active at the requested level
        "is_active_at_level": (request_level is None or c.current_level == request_level),
        "resolution_officer": c.resolution_officer,
        "image_proof": c.image_proof,
        "resolution_proof": c.resolution_proof,
        "citizen_accepted": c.citizen_accepted,
        "escalating_officer": c.escalating_officer,
        # Per-level SLA timer start: resets each time a complaint moves to a new level.
        # Falls back to created_at for ward-level (first level).
        "level_started_at": c.level_started_at.isoformat() if c.level_started_at else c.created_at.isoformat(),
        # Add current level SLA for frontend timer calculations
        "current_level_sla_minutes": current_level_sla,
    }
    return data


def _serialize_history(h):
    return {
        "from_level": h.from_level,
        "to_level": h.to_level,
        "action": h.action,
        "reason": h.reason,
        "timestamp": h.timestamp.isoformat(),
    }


# ---------------------------------------------------------------------------
# POST /api/complaints/submit/
# ---------------------------------------------------------------------------
@api_view(["POST"])
@permission_classes([AllowAny])
@csrf_exempt
def submit_complaint(request):
    citizen_name = (request.data.get("citizen_name") or "").strip()
    description = (request.data.get("description") or "").strip()
    citizen_id = request.data.get("citizen_id")
    title = (request.data.get("title") or "").strip() or None
    category = (request.data.get("category") or "").strip() or None
    district = (request.data.get("district") or "").strip() or None
    area = (request.data.get("area") or "").strip() or None
    priority = (request.data.get("priority") or "").strip() or None
    image_proof = request.data.get("image_proof") or None

    # Default District Logic
    if not district and citizen_id:
        from auth_app.models import User
        try:
            user = User.objects.get(id=citizen_id)
            if user.district:
                district = user.district
        except User.DoesNotExist:
            pass

    if not citizen_name or not description:
        return Response({"success": False, "error": "citizen_name and description are required."},
                        status=status.HTTP_400_BAD_REQUEST)

    complaint = Complaint.objects.create(
        citizen_name=citizen_name,
        title=title,
        category=category,
        description=description,
        district=district,
        area=area,
        priority=priority,
        image_proof=image_proof,
        citizen_id=citizen_id,
        level_started_at=timezone.now(),
    )
    return Response({"success": True, "complaint": _serialize_complaint(complaint)},
                    status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# GET /api/complaints/list/?level=ward   (or ?level=all for every level)
# Visibility rule:
#   - current_level=X  → complaint is currently active at this level
#   - history from_level=X → complaint passed through this level (view-only)
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([AllowAny])
def list_complaints(request):
    from django.db.models import Q
    level = (request.query_params.get("level") or "").strip().lower()
    citizen_id = request.query_params.get("citizen_id")

    if citizen_id:
        complaints = Complaint.objects.filter(citizen_id=citizen_id)
    elif level == "all":
        complaints = Complaint.objects.all()
    elif level in LEVEL_ORDER:
        # Show complaints currently at this level OR that passed through it
        complaints = Complaint.objects.filter(
            Q(current_level=level) |
            Q(history__from_level=level)
        ).distinct()
    else:
        return Response(
            {"success": False, "error": f"Invalid level. Must be one of {LEVEL_ORDER} or 'all'."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Provide SLA settings for all levels to frontend
    level_sla_map = {
        "ward": getattr(settings, "WARD_SLA_MINUTES", 5),
        "municipality": getattr(settings, "MUNICIPAL_SLA_MINUTES", 2),
        "district": getattr(settings, "DISTRICT_SLA_MINUTES", 3),
        "state": getattr(settings, "STATE_SLA_MINUTES", 10),
    }
    
    return Response({
        "success": True,
        "sla_settings": level_sla_map,
        "complaints": [_serialize_complaint(c, level if level != "all" else None) for c in complaints]
    })


# ---------------------------------------------------------------------------
# GET /api/complaints/<id>/
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([AllowAny])
def get_complaint(request, complaint_id):
    try:
        c = Complaint.objects.get(id=complaint_id)
    except Complaint.DoesNotExist:
        return Response({"success": False, "error": "Complaint not found."}, status=status.HTTP_404_NOT_FOUND)

    # Provide SLA settings for all levels to frontend
    level_sla_map = {
        "ward": getattr(settings, "WARD_SLA_MINUTES", 5),
        "municipality": getattr(settings, "MUNICIPAL_SLA_MINUTES", 2),
        "district": getattr(settings, "DISTRICT_SLA_MINUTES", 3),
        "state": getattr(settings, "STATE_SLA_MINUTES", 10),
    }
    
    return Response({
        "success": True,
        "sla_settings": level_sla_map,
        "complaint": _serialize_complaint(c),
        "history": [_serialize_history(h) for h in c.history.all()],
    })


# ---------------------------------------------------------------------------
# DELETE /api/complaints/<id>/delete/
# ---------------------------------------------------------------------------
@api_view(["DELETE"])
@permission_classes([AllowAny])
@csrf_exempt
def delete_complaint(request, complaint_id):
    try:
        c = Complaint.objects.get(id=complaint_id)
    except Complaint.DoesNotExist:
        return Response({"success": False, "error": "Complaint not found."}, status=status.HTTP_404_NOT_FOUND)

    c.delete()
    return Response({"success": True, "message": "Complaint deleted successfully."})


# ---------------------------------------------------------------------------
# PUT /api/complaints/<id>/edit/
# ---------------------------------------------------------------------------
@api_view(["PUT"])
@permission_classes([AllowAny])
@csrf_exempt
def edit_complaint(request, complaint_id):
    try:
        c = Complaint.objects.get(id=complaint_id)
    except Complaint.DoesNotExist:
        return Response({"success": False, "error": "Complaint not found."}, status=status.HTTP_404_NOT_FOUND)

    if not c.is_editable:
        return Response({"success": False, "error": "Complaint cannot be edited after escalation or resolution."},
                        status=status.HTTP_403_FORBIDDEN)

    description = (request.data.get("description") or "").strip()
    if not description:
        return Response({"success": False, "error": "description is required."}, status=status.HTTP_400_BAD_REQUEST)

    c.description = description
    c.save(update_fields=["description"])
    return Response({"success": True, "complaint": _serialize_complaint(c)})


# ---------------------------------------------------------------------------
# POST /api/complaints/<id>/escalate/   (manual emergency escalation)
# ---------------------------------------------------------------------------
@api_view(["POST"])
@permission_classes([AllowAny])
@csrf_exempt
def manual_escalate(request, complaint_id):
    try:
        c = Complaint.objects.get(id=complaint_id)
    except Complaint.DoesNotExist:
        return Response({"success": False, "error": "Complaint not found."}, status=status.HTTP_404_NOT_FOUND)

    if c.status == STATUS_RESOLVED:
        return Response({"success": False, "error": "Resolved complaints cannot be escalated."},
                        status=status.HTTP_400_BAD_REQUEST)

    if c.next_level is None:
        return Response({"success": False, "error": "Complaint is already at the final level (State). Cannot escalate further."},
                        status=status.HTTP_400_BAD_REQUEST)

    reason = (request.data.get("reason") or "").strip()
    officer_name = (request.data.get("officer_name") or "Authority").strip()
    
    if len(reason) < 10:
        return Response({"success": False, "error": "Escalation reason must be at least 10 characters."},
                        status=status.HTTP_400_BAD_REQUEST)

    from_level = c.current_level
    to_level = c.next_level
    now = timezone.now()

    c.current_level = to_level
    c.status = STATUS_ESCALATED
    c.escalated_at = now
    c.escalation_reason = reason
    c.escalating_officer = officer_name
    c.level_started_at = now  # Reset per-level SLA timer for the new level
    c.save(update_fields=["current_level", "status", "escalated_at", "escalation_reason", "escalating_officer", "level_started_at"])

    ComplaintHistory.objects.create(
        complaint=c,
        from_level=from_level,
        to_level=to_level,
        action=ComplaintHistory.ACTION_MANUAL,
        reason=reason,
        timestamp=now,
    )

    return Response({"success": True, "complaint": _serialize_complaint(c)})


# ---------------------------------------------------------------------------
# POST /api/complaints/<id>/resolve/
# ---------------------------------------------------------------------------
@api_view(["POST"])
@permission_classes([AllowAny])
@csrf_exempt
def resolve_complaint(request, complaint_id):
    try:
        c = Complaint.objects.get(id=complaint_id)
    except Complaint.DoesNotExist:
        return Response({"success": False, "error": "Complaint not found."}, status=status.HTTP_404_NOT_FOUND)

    if c.status == STATUS_RESOLVED:
        return Response({"success": False, "error": "Complaint is already resolved."}, status=status.HTTP_400_BAD_REQUEST)

    officer_name = (request.data.get("officer_name") or "").strip()
    officer_id = (request.data.get("officer_id") or "").strip()
    proof = (request.data.get("proof") or "").strip()

    if not officer_name or not officer_id or not proof:
        return Response({"success": False, "error": "Officer name, ID, and proof image are required for resolution."},
                        status=status.HTTP_400_BAD_REQUEST)

    ComplaintHistory.objects.create(
        complaint=c,
        from_level=c.current_level,
        to_level=None,
        action=ComplaintHistory.ACTION_RESOLVED,
        reason=f"Resolved by {officer_name} (ID: {officer_id}).",
        timestamp=timezone.now(),
    )

    c.status = STATUS_RESOLVED
    c.resolution_officer = officer_name
    c.resolution_proof = proof
    c.citizen_accepted = False 
    c.save(update_fields=["status", "resolution_officer", "resolution_proof", "citizen_accepted"])

    return Response({"success": True, "complaint": _serialize_complaint(c)})


# ---------------------------------------------------------------------------
# POST /api/complaints/<id>/accept/ (citizen accept resolution)
# ---------------------------------------------------------------------------
@api_view(["POST"])
@permission_classes([AllowAny])
@csrf_exempt
def accept_resolution(request, complaint_id):
    try:
        c = Complaint.objects.get(id=complaint_id)
    except Complaint.DoesNotExist:
        return Response({"success": False, "error": "Complaint not found."}, status=status.HTTP_404_NOT_FOUND)

    if c.status != STATUS_RESOLVED:
        return Response({"success": False, "error": "Only resolved complaints can be accepted."}, status=status.HTTP_400_BAD_REQUEST)

    c.citizen_accepted = True
    c.save(update_fields=["citizen_accepted"])

    ComplaintHistory.objects.create(
        complaint=c,
        from_level=c.current_level,
        to_level=None,
        action="citizen_accepted",
        reason="Citizen accepted the resolution.",
        timestamp=timezone.now(),
    )

    return Response({"success": True, "complaint": _serialize_complaint(c)})


# ---------------------------------------------------------------------------
# GET /api/complaints/dashboard/
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([AllowAny])
def dashboard_stats(request):
    from auth_app.models import User
    total = Complaint.objects.count()
    pending = Complaint.objects.filter(status=STATUS_PENDING).count()
    escalated = Complaint.objects.filter(status=STATUS_ESCALATED).count()
    resolved = Complaint.objects.filter(status=STATUS_RESOLVED).count()
    in_progress = total - resolved

    total_citizens = User.objects.filter(role=User.ROLE_CITIZEN).count()
    total_authorities = User.objects.filter(role=User.ROLE_AUTHORITY).count()

    return Response({
        "success": True,
        "stats": {
            "total": total,
            "pending": pending,
            "in_progress": in_progress,
            "escalated": escalated,
            "resolved": resolved,
            "total_citizens": total_citizens,
            "total_authorities": total_authorities,
        }
    })


# ---------------------------------------------------------------------------
# GET /api/complaints/images/
# ---------------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([AllowAny])
def get_complaint_images(request):
    """
    Generic endpoint to serve complaint images
    """
    complaint_id = request.query_params.get("complaint_id")
    
    if complaint_id:
        try:
            complaint = Complaint.objects.get(id=complaint_id)
            return Response({
                "success": True,
                "image_proof": complaint.image_proof,
                "resolution_proof": complaint.resolution_proof
            })
        except Complaint.DoesNotExist:
            return Response({"success": False, "error": "Complaint not found"}, status=404)
    
    return Response({"success": True, "message": "Images endpoint available"})


# ---------------------------------------------------------------------------
# POST /api/complaints/feedback/submit/
# GET  /api/complaints/feedback/list/
# ---------------------------------------------------------------------------
from .models import Feedback

@api_view(["POST"])
@permission_classes([AllowAny])
@csrf_exempt
def submit_feedback(request):
    complaint_id  = (request.data.get("complaint_id") or "").strip()
    citizen_name  = (request.data.get("citizen_name") or "").strip()
    rating        = request.data.get("rating")
    message       = (request.data.get("message") or request.data.get("feedbackText") or "").strip()
    category      = (request.data.get("category") or "").strip() or None
    resolved_by   = (request.data.get("resolved_by") or "").strip() or None
    feedback_date = (request.data.get("feedback_date") or request.data.get("feedbackDate") or "").strip() or None

    if not complaint_id or not citizen_name or not message:
        return Response({"success": False, "error": "complaint_id, citizen_name and message are required."},
                        status=status.HTTP_400_BAD_REQUEST)
    try:
        rating = int(rating)
    except (TypeError, ValueError):
        rating = 0

    fb = Feedback.objects.create(
        complaint_id=complaint_id,
        citizen_name=citizen_name,
        rating=rating,
        message=message,
        category=category,
        resolved_by=resolved_by,
        feedback_date=feedback_date,
    )
    return Response({"success": True, "id": fb.id}, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([AllowAny])
def list_feedbacks(request):
    try:
        feedbacks = Feedback.objects.all()
        data = [{
            "id": f.id,
            "complaint_id": f.complaint_id,
            "citizen_name": f.citizen_name,
            "rating": f.rating,
            "message": f.message,
            "category": f.category or "--",
            "resolved_by": f.resolved_by or "--",
            "feedback_date": f.feedback_date or "",
            "created_at": f.created_at.strftime("%d/%m/%Y") if f.created_at else "",
        } for f in feedbacks]
        return Response({"success": True, "feedbacks": data})
    except Exception as e:
        return Response({"success": False, "error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
