import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faCheck,
    faXmark,
    faTriangleExclamation,
    faCirclePlus,
    faTrashCan,
    faArrowsRotate,
} from '@fortawesome/free-solid-svg-icons';
import { ReimportLegDiff } from '../types/route-card';

interface ReimportDiffModalProps {
    diffs: ReimportLegDiff[];
    onConfirm: () => void;
    onCancel: () => void;
}

export function ReimportDiffModal({
    diffs,
    onConfirm,
    onCancel,
}: ReimportDiffModalProps) {
    const matchedCount = diffs.filter((d) => d.status === 'matched').length;
    const modifiedCount = diffs.filter((d) => d.status === 'modified').length;
    const newCount = diffs.filter((d) => d.status === 'new').length;
    const removedCount = diffs.filter((d) => d.status === 'removed').length;

    return (
        <div className="ems-modal-backdrop">
            <div className="ems-modal-dialog">
                <div className="ems-modal-header">
                    <h3>
                        <FontAwesomeIcon icon={faArrowsRotate} /> Route Update Reconciliation
                    </h3>
                    <button type="button" className="ems-btn-icon" onClick={onCancel}>
                        <FontAwesomeIcon icon={faXmark} />
                    </button>
                </div>

                <div className="ems-modal-body">
                    <p className="ems-modal-intro">
                        You uploaded an updated GPX file for this day. To protect your work, we matched your existing navigation descriptions and escape plans against the new route:
                    </p>

                    <div className="ems-diff-summary-badges">
                        <span className="ems-diff-pill ems-diff-pill--matched">
                            {matchedCount} Preserved
                        </span>
                        {modifiedCount > 0 && (
                            <span className="ems-diff-pill ems-diff-pill--modified">
                                {modifiedCount} Path Adjusted
                            </span>
                        )}
                        {newCount > 0 && (
                            <span className="ems-diff-pill ems-diff-pill--new">
                                {newCount} New Segment(s)
                            </span>
                        )}
                        {removedCount > 0 && (
                            <span className="ems-diff-pill ems-diff-pill--removed">
                                {removedCount} Removed
                            </span>
                        )}
                    </div>

                    <div className="ems-diff-table-wrapper">
                        <table className="ems-diff-table">
                            <thead>
                                <tr>
                                    <th>Status</th>
                                    <th>Leg / Journey</th>
                                    <th>Metrics</th>
                                    <th>Preserved Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                {diffs.map((d, i) => (
                                    <tr key={i} className={`ems-diff-row ems-diff-row--${d.status}`}>
                                        <td>
                                            {d.status === 'matched' && (
                                                <span className="ems-status-tag ems-status-tag--matched">
                                                    <FontAwesomeIcon icon={faCheck} /> Matched
                                                </span>
                                            )}
                                            {d.status === 'modified' && (
                                                <span className="ems-status-tag ems-status-tag--modified">
                                                    <FontAwesomeIcon icon={faTriangleExclamation} /> Adjusted
                                                </span>
                                            )}
                                            {d.status === 'new' && (
                                                <span className="ems-status-tag ems-status-tag--new">
                                                    <FontAwesomeIcon icon={faCirclePlus} /> New
                                                </span>
                                            )}
                                            {d.status === 'removed' && (
                                                <span className="ems-status-tag ems-status-tag--removed">
                                                    <FontAwesomeIcon icon={faTrashCan} /> Removed
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            <b>Leg {d.leg_number}</b>: {d.title}
                                        </td>
                                        <td className="font-mono text-sm">
                                            {d.new_metrics && (
                                                <span>
                                                    {d.new_metrics.distance_km}km (+{Math.round(d.new_metrics.ascent_m)}m)
                                                </span>
                                            )}
                                        </td>
                                        <td className="ems-diff-desc-cell">
                                            {d.description ? (
                                                <span className="ems-diff-desc-text">"{d.description}"</span>
                                            ) : (
                                                <i className="ems-text-muted">None</i>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="ems-modal-footer">
                    <button type="button" className="ems-btn ems-btn--secondary" onClick={onCancel}>
                        Cancel (Keep Current Route)
                    </button>
                    <button type="button" className="ems-btn ems-btn--primary" onClick={onConfirm}>
                        <FontAwesomeIcon icon={faCheck} /> Apply Reconciled Route
                    </button>
                </div>
            </div>
        </div>
    );
}
