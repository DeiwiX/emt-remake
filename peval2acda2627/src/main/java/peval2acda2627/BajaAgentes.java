package peval2acda2627;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

public class BajaAgentes {

    public static void baja(Connection con, String placa, String destino) throws SQLException {
        String nombre;
        int comisariaActual;
        try (PreparedStatement ps = con.prepareStatement(
                "SELECT nombre, id_comisaria FROM agentes WHERE placa = ?")) {
            ps.setString(1, placa);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    System.out.println("No existe ningún agente con la placa " + placa);
                    return;
                }
                nombre = rs.getString(1);
                comisariaActual = rs.getInt(2);
            }
        }

        try (PreparedStatement ps = con.prepareStatement(
                "SELECT COUNT(*) FROM asignaciones a JOIN casos c ON c.id = a.id_caso "
                        + "WHERE a.placa_agente = ? AND c.estado <> 'CERRADO'")) {
            ps.setString(1, placa);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                int abiertos = rs.getInt(1);
                if (abiertos > 0) {
                    System.out.println("No se puede dar de baja a " + nombre + ": está asignado a "
                            + abiertos + " caso(s) no cerrado(s)");
                    return;
                }
            }
        }

        if (destino.isEmpty()) {
            eliminar(con, placa);
            System.out.println("Agente " + nombre + " (" + placa + ") dado de baja");
            return;
        }

        int idDestino;
        try {
            idDestino = Integer.parseInt(destino);
        } catch (NumberFormatException e) {
            System.out.println("El id de comisaría debe ser un número");
            return;
        }
        if (idDestino == comisariaActual) {
            System.out.println("El agente ya pertenece a la comisaría " + idDestino);
            return;
        }
        try (PreparedStatement ps = con.prepareStatement("SELECT 1 FROM comisarias WHERE id = ?")) {
            ps.setInt(1, idDestino);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    System.out.println("No se puede trasladar: la comisaría " + idDestino + " no existe");
                    return;
                }
            }
        }
        try (PreparedStatement ps = con.prepareStatement(
                "UPDATE agentes SET id_comisaria = ? WHERE placa = ?")) {
            ps.setInt(1, idDestino);
            ps.setString(2, placa);
            ps.executeUpdate();
        }
        System.out.println("Agente " + nombre + " (" + placa + ") trasladado a la comisaría " + idDestino);
    }

    /** Elimina al agente junto con su historial de asignaciones a casos ya cerrados. */
    private static void eliminar(Connection con, String placa) throws SQLException {
        con.setAutoCommit(false);
        try (PreparedStatement a = con.prepareStatement("DELETE FROM asignaciones WHERE placa_agente = ?");
             PreparedStatement b = con.prepareStatement("DELETE FROM agentes WHERE placa = ?")) {
            a.setString(1, placa);
            a.executeUpdate();
            b.setString(1, placa);
            b.executeUpdate();
            con.commit();
        } catch (SQLException e) {
            con.rollback();
            throw e;
        } finally {
            con.setAutoCommit(true);
        }
    }
}
